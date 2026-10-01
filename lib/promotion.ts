import "server-only";

import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";

import { sanitizeFilename } from "./storage";
import { isCloudPilot, MiB } from "./pilot";

/**
 * Generates review material for manual publication on Nexus Mods.
 * This module does not create pages, upload to Nexus or confirm publication.
 *
 *   promotion-<slug>/
 *   ├── description.bbcode.txt   review conversion in the destination editor
 *   ├── summary.txt              reviewable short description
 *   ├── readme.txt               plain-text project details
 *   ├── changelog.txt            latest build's recorded changes
 *   ├── requirements.txt         dependency checklist, not an import format
 *   ├── files/                   mod archive to extract and upload separately
 *   └── media/                   scanned screenshots, numbered in gallery order
 *
 * The outer ZIP is a preparation package, not the mod's installable archive.
 */

/**
 * Beta Mods' summary cap. The destination site's current form rules still
 * need checking; this is not a claim about every Nexus editor or API.
 */
export const NEXUS_SUMMARY_LIMIT = 250;
export const CLOUD_PROMOTION_INPUT_LIMIT_BYTES = 32 * MiB;
export const CLOUD_PROMOTION_METADATA_LIMIT_BYTES = MiB;
const ZIP_ENTRY_BUDGET_BYTES = 1024;

class PromotionSizeLimitError extends Error {
  constructor() {
    super("This promotion package exceeds the cloud pilot's 32 MiB package limit. Reduce its included files or screenshots and try again.");
  }
}

/**
 * Counts actual payload bytes plus conservative ZIP entry/path overhead.
 * It deliberately counts every queued buffer, even if archiver has already
 * consumed an earlier one. The cap is not based on compressed output size.
 */
export function createPromotionInputBudget(cloudPilot: boolean) {
  let used = 0;
  return {
    add(name: string, payloadBytes: number): number {
      if (!cloudPilot) return used;
      const overhead = ZIP_ENTRY_BUDGET_BYTES + 2 * Buffer.byteLength(name, "utf8");
      if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 0 ||
        payloadBytes > CLOUD_PROMOTION_INPUT_LIMIT_BYTES - used - overhead) {
        throw new PromotionSizeLimitError();
      }
      used += payloadBytes + overhead;
      return used;
    },
  };
}

export type PromotionMod = {
  id: string;
  title: string;
  description: string | null;
  game: string;
};

export type PromotionBuild = {
  versionLabel: string;
  changelog: string | null;
  fileUrl: string;
  uploadedAt: Date;
};

export type PromotionRequirement = {
  nexusModName: string;
  nexusModUrl: string | null;
};

export type StoredFile =
  | { data: Uint8Array; size: number }
  | null;

export type PromotionPackageInput = {
  mod: PromotionMod;
  build: PromotionBuild;
  requirements: PromotionRequirement[];
  /** Reads the build archive from final (scanned) storage. */
  readStoredFile: () => Promise<StoredFile>;
  /** Already-scanned media in gallery order, from final storage only. */
  media?: Array<{ filename: string; caption: string | null; readStoredFile: () => Promise<StoredFile> }>;
};

export type PromotionPackageResult =
  | {
      ok: true;
      zipPath: string;
      size: number;
      filename: string;
      summary: string;
      /** Remove the temp zip + its scratch dir. */
      cleanup: () => Promise<void>;
    }
  | { ok: false; error: string };

/** Bound source text before Markdown expansion or large joins allocate copies. */
export function assertPromotionMetadataBound(input: PromotionPackageInput, cloudPilot: boolean): void {
  if (!cloudPilot) return;
  let used = 0;
  function add(value: string | null | undefined): void {
    // The per-field margin also bounds pathological arrays of empty strings.
    used += 16 + Buffer.byteLength(value ?? "", "utf8");
    if (used > CLOUD_PROMOTION_METADATA_LIMIT_BYTES) {
      throw new Error("Promotion package text exceeds the cloud pilot's 1 MiB metadata limit.");
    }
  }
  for (const value of [input.mod.title, input.mod.game, input.mod.description,
    input.build.versionLabel, input.build.changelog, input.build.fileUrl]) add(value);
  for (const requirement of input.requirements) {
    add(requirement.nexusModName);
    add(requirement.nexusModUrl);
  }
  for (const media of input.media ?? []) {
    add(media.filename);
    add(media.caption);
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "mod"
  );
}

function plainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .trim();
}

/**
 * Summary for the short-description field: the first non-empty line of the
 * description, flattened to plain text. Returns null (and thus package
 * failure at generation time) when it exceeds this exporter's limit.
 */
export function deriveSummary(description: string): { summary: string } | null {
  const first = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!first) return { summary: "A pre-release mod." };
  const summary = plainText(first).replace(/\s+/g, " ").trim();
  if (!summary || summary.length > NEXUS_SUMMARY_LIMIT) return null;
  return { summary };
}

/**
 * Best-effort markdown -> BBCode for the Nexus description field. Formatted
 * at promotion time ONLY (the spec: stored descriptions are plain/markdown,
 * BBCode is generated at promotion). Output is conservative — the author is
 * expected to review it while pasting.
 */
export function markdownToBBCode(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  const codeLines: string[] = [];

  const inline = (line: string): string =>
    line
      .replace(/\*\*([^*]+)\*\*/g, "[b]$1[/b]")
      .replace(/\*([^*]+)\*/g, "[i]$1[/i]")
      .replace(/`([^`]+)`/g, "[code]$1[/code]")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[url=$2]$1[/url]");

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`[code]${codeLines.join("\n")}[/code]`);
        codeLines.length = 0;
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      out.push(`[b]${inline(heading[2])}[/b]`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      out.push(`[quote]${inline(quote[1])}[/quote]`);
      continue;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      out.push(`[*]${inline(bullet[1])}`);
      continue;
    }
    if (!line.trim()) {
      out.push("");
      continue;
    }
    out.push(inline(line));
  }
  if (inCode && codeLines.length > 0) {
    out.push(`[code]${codeLines.join("\n")}[/code]`);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildTextFiles(input: PromotionPackageInput, summary: string) {
  const { mod, build, requirements } = input;
  const descriptionPlain =
    mod.description ? plainText(mod.description) : "(no description recorded)";

  const requirementsText =
    requirements.length === 0
      ? "No requirements are recorded in Beta Mods. Check your mod's dependencies\n" +
        "and add them to the Nexus page before publishing. This file is a checklist, not an automatic import.\n"
      : requirements
          .map(
            (req) =>
              `- ${req.nexusModName}${req.nexusModUrl ? ` — ${req.nexusModUrl}` : ""}`,
          )
          .join("\n") + "\n";

  return {
    "description.bbcode.txt":
      markdownToBBCode(mod.description ?? "") ||
      "(no description recorded — write one on the Nexus page)\n",
    "summary.txt":
      `${summary}\n\n` +
      "(Auto-generated from the description's first line — review before pasting.)\n",
    "readme.txt":
      `${mod.title}\n${mod.game}\n\n` +
      `${descriptionPlain}\n\n` +
      `Release build: ${build.versionLabel}\n` +
      `---\n` +
      `This package was generated from a BetaMods beta.\n` +
      `${input.media?.length ?? 0} scanned screenshot(s) included in media/, in gallery order.\n`,
    "changelog.txt":
      `${mod.title} ${build.versionLabel} (${formatDate(build.uploadedAt)})\n\n` +
      `${build.changelog?.trim() || "No changelog was recorded for this build.\n"}`,
    "requirements.txt": requirementsText,
  };
}

/**
 * Assembles the promotion package zip in a fresh temp directory. Reads the
 * build archive from final storage (never from quarantine) so only clean,
 * scanned files can reach a promotion package.
 */
export async function buildPromotionPackage(
  input: PromotionPackageInput,
): Promise<PromotionPackageResult> {
  const { mod, build } = input;
  const cloudPilot = isCloudPilot();
  const budget = createPromotionInputBudget(cloudPilot);
  try {
    assertPromotionMetadataBound(input, cloudPilot);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Promotion package metadata is too large." };
  }

  // Validate the short description at generation time (spec requirement).
  const derived = deriveSummary(mod.description ?? "");
  if (!derived) {
    return {
      ok: false,
      error:
        `The description's first line is over ${NEXUS_SUMMARY_LIMIT} characters. ` +
        "Shorten it to fit Beta Mods' release-package summary limit.",
    };
  }

  const root = `promotion-${slugify(mod.title)}`;
  const fileBase = sanitizeFilename(path.basename(build.fileUrl)) || "build.zip";
  const texts = buildTextFiles(input, derived.summary);
  const mediaEntries = (input.media ?? []).map((media, index) => ({
    ...media,
    packageFilename: `${String(index + 1).padStart(2, "0")}-${sanitizeFilename(media.filename)}`,
  }));
  const captions = mediaEntries.length
    ? `${mediaEntries.map((media) => `${media.packageFilename}${media.caption ? `: ${media.caption}` : ""}`).join("\n")}\n`
    : "";
  try {
    for (const [name, content] of Object.entries(texts)) {
      budget.add(`${root}/${name}`, Buffer.byteLength(content, "utf8"));
    }
    if (captions) budget.add(`${root}/media/captions.txt`, Buffer.byteLength(captions, "utf8"));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Promotion package text is too large." };
  }

  const stored = await input.readStoredFile();
  if (!stored) {
    return {
      ok: false,
      error: "The latest build's file is missing from storage — re-upload it.",
    };
  }
  try {
    // size is informational; the buffer's actual length is the only safe charge.
    budget.add(`${root}/files/${fileBase}`, stored.data.byteLength);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Promotion package is too large." };
  }

  const scratchDir = await mkdtemp(path.join(tmpdir(), "betamods-promotion-"));
  const suffix = slugify(build.versionLabel);
  const zipFilename = `promotion-${slugify(mod.title)}${suffix ? `-${suffix}` : ""}.zip`;
  const zipPath = path.join(scratchDir, zipFilename);

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const sink = createWriteStream(zipPath);
  const closed = new Promise<void>((resolve) => sink.once("close", resolve));
  const done = new Promise<void>((resolve, reject) => {
    sink.on("close", resolve);
    sink.on("error", reject);
    archive.on("error", reject);
  });
  // A later media read may fail before the final await; register a handler
  // immediately so stream failure cannot become an unhandled rejection.
  void done.catch(() => {});

  try {
    if (process.env.NODE_ENV === "development") {
      archive.on("warning", (err) => console.warn(err));
    }

    archive.pipe(sink);
    for (const [name, content] of Object.entries(texts)) {
      archive.append(content, { name: `${root}/${name}` });
    }
    archive.append(Buffer.from(stored.data.buffer, stored.data.byteOffset, stored.data.byteLength), {
      name: `${root}/files/${fileBase}`,
    });
    for (const media of mediaEntries) {
      const image = await media.readStoredFile();
      if (!image) throw new Error("A screenshot is missing from final storage.");
      budget.add(`${root}/media/${media.packageFilename}`, image.data.byteLength);
      archive.append(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
        name: `${root}/media/${media.packageFilename}`,
      });
    }
    if (captions) archive.append(captions, { name: `${root}/media/captions.txt` });
    await archive.finalize();
    await done;

    const size = (await stat(zipPath)).size;
    return {
      ok: true,
      zipPath,
      size,
      filename: zipFilename,
      summary: derived.summary,
      cleanup: async () => {
        await rm(scratchDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    archive.abort();
    sink.destroy();
    await closed;
    await rm(scratchDir, { recursive: true, force: true });
    return { ok: false, error: error instanceof PromotionSizeLimitError ? error.message : "Failed to assemble the promotion package." };
  }
}
