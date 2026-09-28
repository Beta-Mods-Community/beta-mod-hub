import { basename } from "node:path";

import { getBuildById } from "@lib/dal";
import { readPilotLimits } from "@lib/pilot";
import { presignStoredDownload, readStored, usesR2Storage } from "@lib/storage";

/**
 * Download route for a scanned, promoted build.
 *
 * Only ever reads a final stored location — never quarantine or the upload
 * path — so a file can only get here after a clean malware scan.
 *
 * With STORAGE_DRIVER=r2 this 302s to a short-lived presigned R2 URL and the
 * archive travels directly from R2 to the downloader. That keeps a 250 MiB
 * build off the home connection entirely. The local driver still streams, so
 * dev and the e2e upload test keep working unchanged.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ buildId: string }> },
) {
  const { buildId } = await params;
  const build = await getBuildById(buildId);
  if (!build) return new Response("Not found", { status: 404 });

  const filename = basename(build.fileUrl).replace(/["\\]/g, "_");

  if (usesR2Storage()) {
    let url: string | null;
    try {
      url = await presignStoredDownload(build.fileUrl, {
        filename,
        expiresIn: readPilotLimits().downloadUrlTtlSeconds,
      });
    } catch {
      // Signing is local crypto, so this is a credential/config fault. Fail
      // closed rather than quietly streaming the archive through this PC.
      return new Response("Downloads are temporarily unavailable.", {
        status: 503,
      });
    }
    if (!url) {
      return new Response("Downloads are temporarily unavailable.", {
        status: 503,
      });
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // The signed URL is the actual download; never let a shared cache or
        // the browser keep a second copy of it.
        "Cache-Control": "private, no-store",
      },
    });
  }

  const stored = await readStored(build.fileUrl);
  if (!stored) return new Response("Not found", { status: 404 });

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
