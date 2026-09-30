export const LONG_UPLOAD_WAIT_MS = 120_000;

export function formatUploadElapsed(elapsedMs: number): string {
  const seconds = Number.isFinite(elapsedMs) ? Math.floor(Math.max(0, elapsedMs) / 1000) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function uploadPendingMessage(hasFile: boolean): string {
  return hasFile
    ? "Uploading and checking your file can take 1–2 minutes, sometimes longer. Keep this page open and do not submit again while it is pending."
    : "Waiting for your report to be confirmed. Keep this page open and do not submit again while it is pending.";
}

export function uploadLongWaitMessage(elapsedMs: number): string {
  return Number.isFinite(elapsedMs) && elapsedMs >= LONG_UPLOAD_WAIT_MS
    ? "More than 2 minutes have passed without confirmation. Keep this page open and do not resubmit while it is pending."
    : "";
}
