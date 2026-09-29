import "server-only";

export type ScanResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" }
  | { ok: false; reason: "unavailable"; message: string }
  | { ok: false; reason: "infected"; malware?: string };

/**
 * Send an uploaded file's bytes to the configured malware scanner.
 *
 * Protocol (implemented by scripts/scan-server.mjs on a ClamAV host — local
 * dev, or the ClamAV sidecar container in production):
 *
 *   POST {SCAN_ENDPOINT}
 *   Authorization: Bearer {MALWARE_SCAN_API_KEY}   (optional, if the service requires it)
 *   Content-Type: application/octet-stream
 *   body: raw file bytes
 *
 *   200 {"clean":true} | {"clean":false,"malware":"..."}
 *
 * When SCAN_ENDPOINT isn't set we report not-configured — the upload pipeline
 * refuses to store anything in that case. No silent "skip the scan" path.
 */
export async function scanUpload(data: Uint8Array): Promise<ScanResult> {
  const endpoint = process.env.SCAN_ENDPOINT;
  if (!endpoint) {
    return { ok: false, reason: "not-configured" };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        ...(process.env.MALWARE_SCAN_API_KEY
          ? { authorization: `Bearer ${process.env.MALWARE_SCAN_API_KEY}` }
          : {}),
      },
      // Typed-array generics make Uint8Array awkward as BodyInit — copy to a
      // plain ArrayBuffer (fetch accepts BufferSource).
      body: data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      ) as ArrayBuffer,
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: "unavailable",
        message: `scan service returned HTTP ${response.status}`,
      };
    }

    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("clean" in body) || typeof body.clean !== "boolean") {
      return { ok: false, reason: "unavailable", message: "scan service returned an invalid result" };
    }
    if (body.clean === true) return { ok: true };
    return { ok: false, reason: "infected", malware: "malware" in body && typeof body.malware === "string" ? body.malware : undefined };
  } catch (error) {
    return {
      ok: false,
      reason: "unavailable",
      message:
        error instanceof Error ? error.message : "scan request failed",
    };
  }
}
