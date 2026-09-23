import "server-only";

import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";

import { sanitizeFilename } from "./storage";

/**
 * Promotion package generation — the spec's "The promotion package".
 *
 * Nexus's Upload API can push a file to a mod page that ALREADY exists; it
 * cannot create a new page. So promotion ships a downloadable zip the author
 * walks through top-to-bottom when creating their Nexus page:
 *
 *   promotion-<slug>/
 *   ├── description.bbcode.txt   paste into Nexus's Description field (BBCode)
 *   ├── summary.txt              paste into the short description field
 *   ├── readme.txt               paste into Nexus's Docs step
 *   ├── changelog.txt            paste into Nexus's Articles/changelog step
 *   ├── requirements.txt         dependency checklist (search-and-link, not paste)
 *   ├── files/                   the mod archive, ready to drag into Files
 *   └── media/                   (not generated yet — no screenshot support)
 *
 * The note in the spec is load-bearing: no browser automation against
 * nexusmods.com, and the package stays the flow even if the API scope grows —
 * manual steps just get shed one at a time.
 */

/**
 * Nexus short-description character limit, enforced at generation time per the
 * spec ("validate at generation time, not just at paste time").
 */
export const NEXUS_SUMMARY_LIMIT = 250;

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
 * failure at generation time) when it exceeds the Nexus limit — per the spec,
 * that's caught here, not at paste time.
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
      ? "No requirements recorded here. Add your mod's dependencies on Nexus\n" +
        "after publishing (search-and-link in the Requirements step).\n"
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
      `This package was generated from a BetaMods beta. Screenshots were not\n` +
      `included (no media support yet) — drop them into the Nexus media steps.\n`,
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

  // Validate the short description at generation time (spec requirement).
  const derived = deriveSummary(mod.description ?? "");
  if (!derived) {
    return {
      ok: false,
      error:
        `The description's first line is over ${NEXUS_SUMMARY_LIMIT} characters. ` +
        "Shorten it so the generated summary fits Nexus's short-description limit.",
    };
  }

  const stored = await input.readStoredFile();
  if (!stored) {
    return {
      ok: false,
      error: "The latest build's file is missing from storage — re-upload it.",
    };
  }

  const scratchDir = await mkdtemp(path.join(tmpdir(), "betamods-promotion-"));
  const root = `promotion-${slugify(mod.title)}`;
  const fileBase = sanitizeFilename(path.basename(build.fileUrl)) || "build.zip";
  const suffix = slugify(build.versionLabel);
  const zipFilename = `promotion-${slugify(mod.title)}${suffix ? `-${suffix}` : ""}.zip`;
  const zipPath = path.join(scratchDir, zipFilename);

  const texts = buildTextFiles(input, derived.summary);

  try {
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const sink = createWriteStream(zipPath);

    const done = new Promise<void>((resolve, reject) => {
      sink.on("close", resolve);
      sink.on("error", reject);
      archive.on("error", reject);
    });
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
    // media/ is intentionally not populated — no screenshot support yet.
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
  } catch {
    await rm(scratchDir, { recursive: true, force: true });
    return { ok: false, error: "Failed to assemble the promotion package." };
  }
}