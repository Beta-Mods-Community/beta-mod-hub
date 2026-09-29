import * as z from "zod";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
// Text logs, ZIP archives and game-save formats only. Save formats are
// deliberately narrow: .ess is a compiled plugin and .skse a loadable native
// module — the author is invited to run whatever is uploaded, so ClamAV is not
// a sufficient gate for executable-plugin formats and they are excluded.
export const ATTACHMENT_ACCEPT = ".txt,.log,.zip,.sav,.save,.fos,.json,.ini";
const attachmentExtensions = new Set(ATTACHMENT_ACCEPT.split(","));

export function validateAttachment(name: string, size: number): string | null {
  if (!Number.isSafeInteger(size) || size <= 0) return "Choose a non-empty attachment.";
  if (size > MAX_ATTACHMENT_BYTES) return "Attachments must be 20 MiB or smaller.";
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!attachmentExtensions.has(extension)) return "Use a text log, ZIP archive, or supported game save.";
  return null;
}

export function validateAttachmentContents(name: string, bytes: Uint8Array): string | null {
  if (name.toLowerCase().endsWith(".zip")) {
    const signature = Array.from(bytes.subarray(0, 4)).join(",");
    if (!["80,75,3,4", "80,75,5,6", "80,75,7,8"].includes(signature)) return "The attachment is not a valid ZIP archive.";
  }
  return null;
}

export function validateVoteBuild(displayedBuildId: string, latestBuildId?: string): string | null {
  if (!z.uuid().safeParse(displayedBuildId).success) return "Choose the build you tested.";
  if (!latestBuildId) return "This mod has no build to test yet.";
  if (displayedBuildId !== latestBuildId) return "A newer build was uploaded while this page was open. Your vote was not saved. Download and test the latest build before voting.";
  return null;
}

export const AuthorResponseSchema = z.object({
  status: z.enum(["open", "acknowledged", "fixed"]),
  response: z.string().trim().min(5, "Add a short explanation of the update.").max(2000),
  requestRetest: z.boolean(),
});

export const RetestSchema = z.object({
  buildId: z.uuid(),
  result: z.enum(["resolved", "still-present"]),
  notes: z.string().trim().max(2000),
});

export function canReadAttachment(viewerId: string | undefined, reporterId: string, ownerId: string): boolean {
  return !!viewerId && (viewerId === reporterId || viewerId === ownerId);
}
