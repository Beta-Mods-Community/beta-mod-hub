/**
 * Isolated evaluation only. No application, database, storage, or env imports.
 * API contract checked 2026-09-29 against official Transloadit documentation:
 * https://transloadit.com/docs/api/authentication/
 * https://transloadit.com/docs/api/assemblies-post/
 * https://transloadit.com/docs/api/assemblies-assembly-id-get/
 * https://transloadit.com/docs/api/assembly-status-response/
 * https://transloadit.com/docs/robots/file-virusscan/
 * https://transloadit.com/docs/robots/file-hash/
 * https://transloadit.com/demos/file-filtering/reject-viruses-with-an-error/
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { ZipArchive } from "archiver";

const API = "https://api2.transloadit.com/assemblies";
const MAX_FIXTURE_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
// Observed on the Community plan in the synthetic live evaluation, 2026-09-29.
// This exact plan notice alone says nothing about whether any fixture is clean.
const COMMUNITY_NOTICE = "Some files in this Assembly were auto-watermarked because you're on the Community plan. Processing is slower because of this. Upgrading to any paid plan will increase file conversion speed and remove the watermarks.";
const generatedFixtures = new WeakMap();
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export const LIMITATIONS = Object.freeze([
  "Evaluation only; never a production clean-scan authorization.",
  "250 MiB scan coverage, internal ClamAV limits, archive depth and encrypted archives are unresolved.",
  "Small fixture acceptance does not establish archive contents were fully scanned.",
  "Provider-reported SHA256 is compared; independent downloaded byte preservation is unverified.",
  "No result URLs are downloaded. Provider retention, account quotas and cost need separate confirmation.",
  "A timed-out POST may have created a billable Assembly; this probe never retries it.",
]);

export class ProbeError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Strict flags: there is deliberately no file, URL, endpoint or env-file option. */
export function parseArgs(args) {
  const options = { live: false, credentials: "file", help: false };
  const seen = new Set();
  for (const arg of args) {
    const key = arg.startsWith("--credentials=") ? "--credentials" : arg;
    if (seen.has(key)) throw new ProbeError("duplicate-option");
    seen.add(key);
    if (arg === "--live") options.live = true;
    else if (arg === "--dry-run") options.live = false;
    else if (arg === "--help") options.help = true;
    else if (arg === "--credentials=file") options.credentials = "file";
    else if (arg === "--credentials=env") options.credentials = "env";
    else throw new ProbeError("unsupported-option");
  }
  if (seen.has("--live") && seen.has("--dry-run")) throw new ProbeError("conflicting-mode");
  return options;
}

/** Parse only dedicated credentials and the optional algorithm, without interpolation. */
export function parseCredentialFile(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^(TRANSLOADIT_KEY|TRANSLOADIT_SECRET|TRANSLOADIT_SIGNATURE_ALGORITHM)\s*=\s*(.*?)\s*$/.exec(line.trim());
    if (!match || Object.hasOwn(values, match[1])) throw new ProbeError("invalid-credential-file");
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return credentialsFrom(values);
}

export function credentialsFrom(values) {
  const key = values.TRANSLOADIT_KEY;
  const secret = values.TRANSLOADIT_SECRET;
  const algorithm = values.TRANSLOADIT_SIGNATURE_ALGORITHM ?? "sha384";
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,256}$/.test(key) || typeof secret !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
    throw new ProbeError("missing-or-invalid-credentials");
  }
  if (!["sha256", "sha384"].includes(algorithm)) throw new ProbeError("unsupported-signature-algorithm");
  return { key, secret, algorithm };
}

async function zip(entries) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const chunks = [];
  let size = 0;
  const complete = new Promise((resolve, reject) => {
    archive.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_FIXTURE_BYTES) { archive.abort(); reject(new ProbeError("fixture-too-large")); }
      else chunks.push(chunk);
    });
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.on("warning", reject);
  });
  for (const [name, bytes] of entries) archive.append(bytes, { name, date: new Date("2000-01-01T00:00:00Z") });
  await Promise.all([archive.finalize(), complete]);
  return complete;
}

/** Harmless synthetic data and the standard inert AV test marker, all in memory. */
export async function createFixtures() {
  const text = Buffer.from("Synthetic Transloadit evaluation fixture. No mod or user content.\n");
  // Split the inert EICAR marker in source; never write its assembled bytes to disk.
  const eicar = Buffer.from(["X5O!P%@AP[4", "\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-", "ANTIVIRUS-TEST-FILE!$H+H*"].join(""));
  const harmlessZip = await zip([["readme.txt", text]]);
  const eicarZip = await zip([["eicar.txt", eicar]]);
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNQcGj4DwADRAHgEP20EAAAAABJRU5ErkJggg==", "base64");
  const fixtures = [
    ["benign-text.txt", "text/plain", "accept", text],
    ["harmless.zip", "application/zip", "accept", harmlessZip],
    ["eicar.txt", "text/plain", "virus-decline", eicar],
    ["eicar.zip", "application/zip", "virus-decline", eicarZip],
    ["nested-eicar.zip", "application/zip", "virus-decline", await zip([["inner.zip", eicarZip]])],
    ["malformed.zip", "application/zip", "reject-invalid", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])],
    ["pixel.png", "image/png", "accept", pixel],
    ["image-envelope.zip", "application/zip", "accept", await zip([["pixel.png", pixel]])],
    ["eicar-image-envelope.zip", "application/zip", "virus-decline", await zip([["pixel.png", eicar]])],
  ].map(([name, mime, expected, bytes]) => {
    const fixture = Object.freeze({ name, mime, expected, bytes, size: bytes.length, sha256: digest(bytes) });
    generatedFixtures.set(fixture, fixture.sha256);
    return fixture;
  });
  if (fixtures.some(fixture => fixture.size > MAX_FIXTURE_BYTES)) throw new ProbeError("fixture-too-large");
  return fixtures;
}

export function describeFixture(fixture) {
  return { name: fixture.name, bytes: fixture.size, sha256: fixture.sha256, expected: fixture.expected };
}

export function signedParams(credentials, now = Date.now()) {
  const algorithm = credentials.algorithm ?? "sha384";
  if (!["sha256", "sha384"].includes(algorithm)) throw new ProbeError("unsupported-signature-algorithm");
  const params = JSON.stringify({
    auth: { key: credentials.key, expires: new Date(now + 5 * 60_000).toISOString(), max_size: MAX_FIXTURE_BYTES + 16_384, max_number_of_files: 1 },
    nonce: randomUUID(),
    steps: {
      scanned: { robot: "/file/virusscan", use: ":original", error_on_decline: true, result: true, ignore_errors: [] },
      hashed: { robot: "/file/hash", use: "scanned", algorithm: "sha256", partial: "full", result: true, ignore_errors: [] },
    },
  });
  return { params, signature: `${algorithm}:${createHmac(algorithm, credentials.secret).update(params).digest("hex")}` };
}

/** Use the documented fixed-host fallback. Never trust or expose a server URL. */
export function statusUrl(assemblyId) {
  if (typeof assemblyId !== "string" || !/^[a-z0-9]{32}$/.test(assemblyId)) throw new ProbeError("invalid-assembly-id");
  return `${API}/${assemblyId}`;
}

function nonClean(reason) { return { accepted: false, observation: reason, providerSha256: "unverified" }; }

function errorCategory(code) {
  if (code === "FILE_VIRUSSCAN_DECLINED_FILE") return "virus-declined";
  if (["FILE_VIRUSSCAN_INVALID_INPUT", "FILE_META_DATA_ERROR", "INVALID_FILE_META_DATA"].includes(code)) return "unscannable";
  if (["BILL_LIMIT_EXCEEDED", "PLAN_LIMIT_EXCEEDED", "ASSEMBLY_PLAN_FILE_SIZE_LIMIT_EXCEEDED", "RATE_LIMIT_REACHED", "ASSEMBLY_STATUS_FETCHING_RATE_LIMIT_REACHED"].includes(code)) return "quota-or-rate-limit";
  if (["INVALID_SIGNATURE", "INVALID_AUTH_KEY_PARAMETER", "GET_ACCOUNT_UNKNOWN_AUTH_KEY", "INSUFFICIENT_AUTH_SCOPE", "AUTH_EXPIRED"].includes(code)) return "authentication-error";
  return "provider-error";
}

function isCommunityNotice(warning) {
  return isObject(warning) && Object.keys(warning).length === 2 && warning.level === "notice" && warning.msg === COMMUNITY_NOTICE;
}

function hasCommunityNotice(value) {
  return isObject(value) && Array.isArray(value.warnings) && value.warnings.some(isCommunityNotice);
}

function hasProblem(value, allowCommunityNotice = false) {
  if (!isObject(value)) return true;
  if (Object.hasOwn(value, "error")) return true;
  if (Object.hasOwn(value, "errors") && (!Array.isArray(value.errors) || value.errors.length !== 0)) return true;
  if (!Object.hasOwn(value, "warnings")) return false;
  return !Array.isArray(value.warnings) || value.warnings.some(warning => !allowCommunityNotice || !isCommunityNotice(warning));
}

/** Fail closed on incomplete, ambiguous, mismatched or partially successful responses. */
export function evaluateAssembly(status, fixture) {
  const notice = hasCommunityNotice(status) ? { communityWatermarkNotice: true } : {};
  const fail = reason => ({ ...nonClean(reason), ...notice });
  if (!isObject(status)) return fail("malformed-response");
  if (Object.hasOwn(status, "error")) return fail(errorCategory(status.error));
  if (hasProblem(status, true)) return fail("warning-or-error");
  if (status.ok !== "ASSEMBLY_COMPLETED") return fail("not-completed");
  if (!Array.isArray(status.uploads) || status.uploads.length !== 1 || !isObject(status.results)) return fail("ambiguous-results");
  const upload = status.uploads[0];
  if (hasProblem(upload) || typeof upload.id !== "string" || !upload.id || upload.original_id !== upload.id || upload.name !== fixture.name || upload.original_name !== fixture.name || upload.size !== fixture.size || upload.field !== "file") {
    return fail("upload-mismatch");
  }
  const keys = Object.keys(status.results);
  if (keys.some(key => !["scanned", "hashed", ":original"].includes(key))) return fail("unexpected-result-step");
  for (const step of ["scanned", "hashed", ...(keys.includes(":original") ? [":original"] : [])]) {
    const files = status.results[step];
    if (!Array.isArray(files) || files.length !== 1) return fail("ambiguous-results");
    const file = files[0];
    if (hasProblem(file) || file.original_id !== upload.id || file.original_name !== fixture.name || file.name !== fixture.name || file.size !== fixture.size || file.field !== "file") {
      return fail("result-mismatch");
    }
  }
  const meta = status.results.hashed[0].meta;
  if (!isObject(meta) || meta.hash !== fixture.sha256 || (Object.hasOwn(meta, "hash_partial") && meta.hash_partial !== "full")) return fail("sha256-mismatch");
  if (fixture.expected !== "accept") return fail("unexpected-acceptance");
  return { accepted: true, observation: "scan-result-confirmed", providerSha256: "matches-local", ...notice };
}

async function readJson(response) {
  if (response.status >= 300 && response.status < 400) throw new ProbeError("redirect-refused");
  if (response.status === 429) throw new ProbeError("quota-or-rate-limit");
  const type = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(type) || !response.body) throw new ProbeError("invalid-response-type");
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_RESPONSE_BYTES) throw new ProbeError("response-too-large");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_RESPONSE_BYTES) throw new ProbeError("response-too-large");
    chunks.push(chunk);
  }
  let result;
  try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ProbeError("malformed-response"); }
  if (!isObject(result)) throw new ProbeError("malformed-response");
  if (!response.ok && !Object.hasOwn(result, "error")) throw new ProbeError("http-error");
  return result;
}

/**
 * A single POST, bounded requests and polling, no credentials on GET, no redirects.
 * @returns {Promise<{ accepted: boolean, observation: string, providerSha256: string, communityWatermarkNotice?: boolean }>}
 */
export async function scanFixture(fixture, credentials, options = {}) {
  if (!generatedFixtures.has(fixture) || generatedFixtures.get(fixture) !== digest(fixture.bytes)) throw new ProbeError("synthetic-fixtures-only");
  if (options.live !== true) throw new ProbeError("live-consent-required");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? delay;
  const totalMs = options.totalMs ?? 120_000;
  const requestMs = options.requestMs ?? 15_000;
  if (![totalMs, requestMs].every(value => Number.isFinite(value) && value > 0 && value <= 180_000)) throw new ProbeError("invalid-timeout");
  const deadline = now() + totalMs;
  const signed = signedParams(credentials, now());
  const form = new FormData();
  form.append("params", signed.params);
  form.append("signature", signed.signature);
  form.append("file", new Blob([fixture.bytes], { type: fixture.mime }), fixture.name);
  let communityWatermarkNotice = false;
  const includeNotice = result => ({ ...result, ...(communityWatermarkNotice ? { communityWatermarkNotice: true } : {}) });
  async function request(url, init) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new ProbeError("timeout");
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new ProbeError("timeout")); }, Math.min(remaining, requestMs));
    });
    try {
      return await Promise.race([
        (async () => readJson(await fetchImpl(url, { ...init, redirect: "error", credentials: "omit", signal: controller.signal })))(),
        timeout,
      ]);
    } finally { clearTimeout(timer); controller.abort(); }
  }
  try {
    let status = await request(API, { method: "POST", body: form, headers: { Accept: "application/json" } });
    communityWatermarkNotice = hasCommunityNotice(status);
    // Early errors are non-clean even when creation failed before assigning an ID.
    if (Object.hasOwn(status, "error")) return includeNotice(evaluateAssembly(status, fixture));
    const id = status.assembly_id;
    const url = statusUrl(id);
    for (let polls = 0; ; polls++) {
      communityWatermarkNotice ||= hasCommunityNotice(status);
      if (status.assembly_id !== id) return includeNotice(nonClean("assembly-mismatch"));
      if (hasProblem(status, true) || !["ASSEMBLY_UPLOADING", "ASSEMBLY_EXECUTING"].includes(status.ok)) return includeNotice(evaluateAssembly(status, fixture));
      if (polls >= 60 || now() + 2_000 >= deadline) throw new ProbeError("timeout");
      await wait(2_000);
      status = await request(url, { method: "GET", headers: { Accept: "application/json" } });
    }
  } catch (error) {
    // Never serialize upstream messages, bodies, stack traces, IDs or capability URLs.
    return includeNotice(nonClean(error instanceof ProbeError ? error.code : "network-error"));
  }
}

export function expectationMet(fixture, result) {
  if (fixture.expected === "accept") return result.accepted === true;
  if (fixture.expected === "virus-decline") return result.observation === "virus-declined";
  return result.observation === "unscannable";
}
