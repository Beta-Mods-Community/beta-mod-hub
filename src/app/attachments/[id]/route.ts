import { and, eq } from "drizzle-orm";
import { db } from "@lib/db";
import { getViewer } from "@lib/access";
import { betaMods, bugReports } from "@/db/schema";
import { bugAttachments } from "@/db/feedback-schema";
import { canReadAttachment } from "@lib/feedback-policy";
import { presignStoredDownload, readStored, usesR2Storage } from "@lib/storage";
import { readPilotLimits } from "@lib/pilot";
import { z } from "zod";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !db) return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const [row] = await db.select({ attachment: bugAttachments, reporterId: bugReports.reporterId, ownerId: betaMods.ownerId })
    .from(bugAttachments).innerJoin(bugReports, eq(bugReports.id, bugAttachments.reportId))
    .innerJoin(betaMods, eq(betaMods.id, bugAttachments.betaModId))
    .where(and(eq(bugAttachments.id, id), eq(bugAttachments.scanState, "clean")));
  if (!row || !canReadAttachment(viewer.userId, row.reporterId, row.ownerId)) return new Response("Not found", { status: 404 });
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  try {
    if (usesR2Storage()) {
      const url = await presignStoredDownload(row.attachment.objectKey, { filename: row.attachment.filename, contentType: "application/octet-stream", expiresIn: Math.min(60, readPilotLimits().downloadUrlTtlSeconds) });
      if (!url) throw new Error("No signed download");
      return new Response(null, { status: 302, headers: { ...headers, Location: url } });
    }
    const stored = await readStored(row.attachment.objectKey);
    if (!stored) return new Response("Not found", { status: 404, headers });
    return new Response(new Uint8Array(stored.data), { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(stored.size), "Content-Disposition": `attachment; filename="${row.attachment.filename.replace(/["\\\r\n]/g, "_")}"` } });
  } catch { return new Response("Attachment downloads are temporarily unavailable.", { status: 503, headers }); }
}
