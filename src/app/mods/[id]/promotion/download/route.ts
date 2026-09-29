import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { getBetaMod, getBuildsByModId, getRequirementsByModId } from "@lib/dal";
import { buildPromotionPackage } from "@lib/promotion";
import { getSession } from "@lib/session";
import { readStored } from "@lib/storage";
import { getModMedia } from "@lib/media-service";

/**
 * Download route for a mod's promotion package (spec "The promotion package").
 *
 * Owner-only. Generates the zip fresh on demand, streams it, then removes the
 * temp files. The build archive inside comes from final storage only — never
 * from quarantine — so the package can only contain clean, scanned files.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  const mod = await getBetaMod(id);
  if (!mod || !session || session.userId !== mod.ownerId) {
    return new Response("Not found", { status: 404 });
  }

  const builds = await getBuildsByModId(id);
  const latest = builds[0];
  if (!latest) {
    return new Response(
      "Upload a build before generating a promotion package.",
      { status: 400 },
    );
  }

  const requirements = await getRequirementsByModId(id);
  const media = await getModMedia(id);

  const result = await buildPromotionPackage({
    mod: {
      id: mod.id,
      title: mod.title,
      description: mod.description,
      game: mod.game,
    },
    build: {
      versionLabel: latest.versionLabel,
      changelog: latest.changelog,
      fileUrl: latest.fileUrl,
      uploadedAt: latest.uploadedAt,
    },
    requirements: requirements.map((r) => ({
      nexusModName: r.nexusModName,
      nexusModUrl: r.nexusModUrl,
    })),
    readStoredFile: () => readStored(latest.fileUrl),
    media: media.map((image) => ({
      filename: image.objectKey.split("/").at(-1) || `${image.id}.webp`,
      caption: image.caption,
      readStoredFile: () => readStored(image.objectKey),
    })),
  });

  if (!result.ok) {
    return new Response(result.error, { status: 400 });
  }

  const read = createReadStream(result.zipPath);
  read.on("error", () => void result.cleanup());

  const body = Readable.toWeb(read) as unknown as ReadableStream<Uint8Array>;
  // The stream closes when the client has received everything — clean up then.
  read.on("close", () => void result.cleanup());

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(result.size),
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
