import { and, eq } from "drizzle-orm";
import { modMedia } from "@/db/schema";
import { db } from "@lib/db";
import { getBetaMod } from "@lib/dal";
import { MediaIdSchema } from "@lib/media-policy";
import { presignStoredDownload, readStored, usesR2Storage } from "@lib/storage";

export const runtime = "nodejs";

/** The bucket stays private. Only indexed, scanned images get a short-lived URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!db || !MediaIdSchema.safeParse(id).success) return new Response("Not found", { status: 404 });
  const [media] = await db.select().from(modMedia).where(and(eq(modMedia.id, id), eq(modMedia.scanState, "clean")));
  if (!media || !(await getBetaMod(media.betaModId))) return new Response("Not found", { status: 404 });
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (usesR2Storage()) {
    try {
      const url = await presignStoredDownload(media.objectKey, { inline: true, contentType: media.mimeType, expiresIn: 300 });
      if (url) return new Response(null, { status: 302, headers: { ...headers, Location: url } });
    } catch { /* A credential fault must not fall through to proxying bytes. */ }
    return new Response("Images are temporarily unavailable.", { status: 503, headers });
  }
  const stored = await readStored(media.objectKey);
  if (!stored) return new Response("Not found", { status: 404, headers });
  return new Response(new Uint8Array(stored.data).buffer, { headers: {
    ...headers, "Content-Type": media.mimeType, "Content-Length": String(stored.size), "Content-Disposition": "inline",
  } });
}
