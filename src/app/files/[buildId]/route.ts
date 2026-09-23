import { basename } from "node:path";

import { getBuildById } from "@lib/dal";
import { readStored } from "@lib/storage";

/**
 * Download route for a scanned, promoted build. Only reads from the final
 * stored location (never from quarantine/upload paths) — a file can only get
 * here after a clean malware scan.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ buildId: string }> },
) {
  const { buildId } = await params;
  const build = await getBuildById(buildId);
  if (!build) return new Response("Not found", { status: 404 });

  const stored = await readStored(build.fileUrl);
  if (!stored) return new Response("Not found", { status: 404 });

  const filename = basename(build.fileUrl).replace(/["\\]/g, "_");

  return new Response(
    stored.data.buffer.slice(
      stored.data.byteOffset,
      stored.data.byteOffset + stored.data.byteLength,
    ) as ArrayBuffer,
    {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(stored.size),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=86400",
      },
    },
  );
}