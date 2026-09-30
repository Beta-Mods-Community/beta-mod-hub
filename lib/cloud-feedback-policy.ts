import { validateCloudArchive } from "./cloud-archive";
import { CLOUD_SCAN_MAX_BYTES } from "./cloud-zip";

/** Binary saves need format-specific validation before entering this tiny pilot.
 * Renaming an archive must not bypass the stricter ZIP policy.
 */
export async function validateCloudFeedback(name: string, bytes: Uint8Array): Promise<string | null> {
  if (!bytes.byteLength || bytes.byteLength > CLOUD_SCAN_MAX_BYTES) return "Pilot attachments must be between 1 byte and 8 MiB.";
  if (/\.zip$/i.test(name)) {
    const result = await validateCloudArchive(bytes);
    return result.ok ? null : result.message;
  }
  if (!/\.(?:txt|log|json|ini)$/i.test(name)) return "The cloud pilot accepts plain-text logs, JSON/INI or a standard ZIP. Binary game saves are not supported yet.";
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Tab and newlines are the only permitted ASCII control characters.
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new Error();
  } catch { return "Use a plain UTF-8 text file, or package the attachment as a standard ZIP."; }
  return null;
}
