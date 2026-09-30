import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { ScanResult } from "./scan";
import { CLOUD_SCAN_MAX_BYTES, createScanEnvelope, SCAN_ENVELOPE_NAME, SCAN_ENVELOPE_OVERHEAD } from "./cloud-zip";

// Reviewed against the official authentication, assembly-status-response,
// /file/virusscan and /file/hash docs; synthetic live evaluation 2026-09-29.
// https://transloadit.com/docs/api/authentication/
// https://transloadit.com/docs/api/assembly-status-response/
// https://transloadit.com/docs/robots/file-virusscan/
// https://transloadit.com/docs/robots/file-hash/
const API = "https://api2.transloadit.com/assemblies";
const MAX_RESPONSE_BYTES = 256 * 1024;
// Provider max_size covers the entire multipart body, not just the ZIP. Reserve
// bounded space for signed params, signature and multipart framing; the input
// remains capped separately at 8 MiB before any request is made.
const SCAN_MULTIPART_ALLOWANCE_BYTES = 4 * 1024;
const COMMUNITY_NOTICE = "Some files in this Assembly were auto-watermarked because you're on the Community plan. Processing is slower because of this. Upgrading to any paid plan will increase file conversion speed and remove the watermarks.";
let activeScan = false;
type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);

export type TransloaditCredentials = { key: string; secret: string; algorithm: "sha256" | "sha384" };
export type TransloaditScanOptions = {
  credentials?: TransloaditCredentials;
  fetchImpl?: typeof fetch;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<unknown>;
  totalMs?: number;
  requestMs?: number;
};

export function transloaditCredentials(values: Record<string, string | undefined>): TransloaditCredentials | null {
  const key = values.TRANSLOADIT_KEY;
  const secret = values.TRANSLOADIT_SECRET;
  const algorithm = values.TRANSLOADIT_SIGNATURE_ALGORITHM;
  if (!key || !/^[A-Za-z0-9_-]{8,256}$/.test(key) || !secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret)) return null;
  // Match the dashboard key's algorithm. Never retry/downgrade signatures.
  if (algorithm !== "sha256" && algorithm !== "sha384") return null;
  return { key, secret, algorithm };
}

export function signedScanParams(credentials: TransloaditCredentials, now: number): { params: string; signature: string } {
  const params = JSON.stringify({
    auth: {
      key: credentials.key,
      expires: new Date(now + 5 * 60_000).toISOString(),
      max_size: CLOUD_SCAN_MAX_BYTES + SCAN_ENVELOPE_OVERHEAD + SCAN_MULTIPART_ALLOWANCE_BYTES,
      max_number_of_files: 1,
    },
    nonce: randomUUID(),
    steps: {
      scanned: { robot: "/file/virusscan", use: ":original", error_on_decline: true, result: true, ignore_errors: [] },
      hashed: { robot: "/file/hash", use: "scanned", algorithm: "sha256", partial: "full", result: true, ignore_errors: [] },
    },
  });
  return { params, signature: `${credentials.algorithm}:${createHmac(credentials.algorithm, credentials.secret).update(params).digest("hex")}` };
}

function unavailable(message = "Managed scanner could not confirm a clean result. Please try again later."): ScanResult {
  return { ok: false, reason: "unavailable", message };
}

function knownNotice(value: unknown): boolean {
  return object(value) && Object.keys(value).length === 2 && value.level === "notice" && value.msg === COMMUNITY_NOTICE;
}

function hasProblem(value: unknown, allowNotice = false): boolean {
  if (!object(value) || Object.hasOwn(value, "error")) return true;
  if (Object.hasOwn(value, "errors") && (!Array.isArray(value.errors) || value.errors.length !== 0)) return true;
  return Object.hasOwn(value, "warnings") && (!Array.isArray(value.warnings) || value.warnings.some(warning => !allowNotice || !knownNotice(warning)));
}

/** Exact envelope identity and one explicit scanner result are both mandatory. */
export function evaluateManagedScan(status: unknown, expected: { size: number; sha256: string }): ScanResult {
  if (!object(status)) return unavailable();
  if (status.error === "FILE_VIRUSSCAN_DECLINED_FILE") return { ok: false, reason: "infected" };
  if (hasProblem(status, true) || status.ok !== "ASSEMBLY_COMPLETED") return unavailable();
  if (!Array.isArray(status.uploads) || status.uploads.length !== 1 || !object(status.results)) return unavailable();
  const upload: unknown = status.uploads[0];
  if (!object(upload) || hasProblem(upload) || typeof upload.id !== "string" || !upload.id || upload.original_id !== upload.id || upload.name !== SCAN_ENVELOPE_NAME || upload.original_name !== SCAN_ENVELOPE_NAME || upload.size !== expected.size || upload.field !== "file") return unavailable();
  const keys = Object.keys(status.results);
  if (keys.some(key => !["scanned", "hashed", ":original"].includes(key))) return unavailable();
  for (const step of ["scanned", "hashed", ...(keys.includes(":original") ? [":original"] : [])]) {
    const files = status.results[step];
    if (!Array.isArray(files) || files.length !== 1) return unavailable();
    const file: unknown = files[0];
    if (!object(file) || hasProblem(file) || file.original_id !== upload.id || file.original_name !== SCAN_ENVELOPE_NAME || file.name !== SCAN_ENVELOPE_NAME || file.size !== expected.size || file.field !== "file") return unavailable();
  }
  const hashed = (status.results.hashed as JsonObject[])[0];
  if (!object(hashed.meta) || hashed.meta.hash !== expected.sha256 || (Object.hasOwn(hashed.meta, "hash_partial") && hashed.meta.hash_partial !== "full")) return unavailable();
  return { ok: true };
}

async function readJson(response: Response): Promise<JsonObject> {
  if (response.status >= 300 && response.status < 400 || response.status === 429) throw new Error("scanner-http-refused");
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || !response.body) throw new Error("scanner-response-type");
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw new Error("scanner-response-limit");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("scanner-response-limit");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!object(value) || !response.ok && !Object.hasOwn(value, "error")) throw new Error("scanner-invalid-response");
  return value;
}

/**
 * Bounded synchronous scanning for the small-file pilot, never the large-file
 * deployment path. One active scan per process; no queue and no POST retries.
 * The original caller-owned bytes are never replaced with provider output.
 */
export async function scanWithTransloadit(data: Uint8Array, options: TransloaditScanOptions = {}): Promise<ScanResult> {
  if (data.byteLength === 0 || data.byteLength > CLOUD_SCAN_MAX_BYTES) return unavailable("Cloud pilot uploads must be between 1 byte and 8 MiB.");
  const credentials = options.credentials ?? transloaditCredentials(process.env);
  if (!credentials) return { ok: false, reason: "not-configured" };
  // Revalidate injectable values too, so unsupported algorithms fail closed.
  if (!transloaditCredentials({ TRANSLOADIT_KEY: credentials.key, TRANSLOADIT_SECRET: credentials.secret, TRANSLOADIT_SIGNATURE_ALGORITHM: credentials.algorithm })) return { ok: false, reason: "not-configured" };
  if (activeScan) return unavailable("Another upload is being scanned. Please try again shortly.");
  activeScan = true;
  try {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const now = options.now ?? Date.now;
    const wait = options.wait ?? delay;
    const totalMs = options.totalMs ?? 120_000;
    const requestMs = options.requestMs ?? 30_000;
    if (![totalMs, requestMs].every(value => Number.isFinite(value) && value > 0 && value <= 120_000)) return unavailable();
    const deadline = now() + totalMs;
    const envelope = createScanEnvelope(data);
    const expected = { size: envelope.length, sha256: createHash("sha256").update(envelope).digest("hex") };
    const signed = signedScanParams(credentials, now());
    const form = new FormData();
    form.append("params", signed.params);
    form.append("signature", signed.signature);
    form.append("file", new Blob([envelope as Uint8Array<ArrayBuffer>], { type: "application/zip" }), SCAN_ENVELOPE_NAME);
    async function request(url: string, init: RequestInit): Promise<JsonObject> {
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error("scanner-timeout");
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("scanner-timeout")); }, Math.min(remaining, requestMs));
      });
      try {
        return await Promise.race([
          fetchImpl(url, { ...init, redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal }).then(readJson),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    let status = await request(API, { method: "POST", body: form, headers: { Accept: "application/json" } });
    if (Object.hasOwn(status, "error")) return evaluateManagedScan(status, expected);
    const id = status.assembly_id;
    if (typeof id !== "string" || !/^[a-z0-9]{32}$/.test(id)) return unavailable();
    // Never use assembly_url / assembly_ssl_url supplied in response data.
    const pollUrl = `${API}/${id}`;
    for (let polls = 0; ; polls++) {
      if (status.assembly_id !== id) return unavailable();
      if (hasProblem(status, true) || status.ok !== "ASSEMBLY_UPLOADING" && status.ok !== "ASSEMBLY_EXECUTING") return evaluateManagedScan(status, expected);
      if (polls >= 60 || now() + 2_000 >= deadline) return unavailable();
      await wait(2_000);
      status = await request(pollUrl, { method: "GET", headers: { Accept: "application/json" } });
    }
  } catch {
    // Never return/log exception messages, secrets, Assembly IDs or result URLs.
    return unavailable();
  } finally {
    activeScan = false;
  }
}
