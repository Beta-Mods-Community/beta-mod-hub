import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";
import { CLOUD_SCAN_MAX_BYTES, createScanEnvelope, SCAN_ENVELOPE_NAME } from "../lib/cloud-zip";
import { evaluateManagedScan, scanWithTransloadit, signedScanParams, transloaditCredentials, type TransloaditCredentials } from "../lib/transloadit-scan";

const credentials: TransloaditCredentials = { key: "synthetic-key", secret: "synthetic-secret-no-live-access", algorithm: "sha384" };
const data = Buffer.from("A harmless managed-scanner test.");
const envelope = createScanEnvelope(data);
const expected = { size: envelope.length, sha256: createHash("sha256").update(envelope).digest("hex") };
const assemblyId = "a".repeat(32);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function completed(hash = expected.sha256, size = expected.size) {
  const file = { id: "file-id", original_id: "file-id", name: SCAN_ENVELOPE_NAME, original_name: SCAN_ENVELOPE_NAME, size, field: "file" };
  return { assembly_id: assemblyId, ok: "ASSEMBLY_COMPLETED", uploads: [{ ...file }], results: { scanned: [{ ...file }], hashed: [{ ...file, meta: { hash, hash_partial: "full" } }] } };
}
const fetchReturning = (status: unknown): typeof fetch => (async () => json(status)) as typeof fetch;

test("credentials require explicit supported signing algorithm", () => {
  assert.equal(transloaditCredentials({}), null);
  assert.equal(transloaditCredentials({ TRANSLOADIT_KEY: credentials.key, TRANSLOADIT_SECRET: credentials.secret }), null);
  for (const algorithm of ["sha256", "sha384"]) {
    assert.equal(transloaditCredentials({ TRANSLOADIT_KEY: credentials.key, TRANSLOADIT_SECRET: credentials.secret, TRANSLOADIT_SIGNATURE_ALGORITHM: algorithm })?.algorithm, algorithm);
  }
  assert.equal(transloaditCredentials({ TRANSLOADIT_KEY: credentials.key, TRANSLOADIT_SECRET: credentials.secret, TRANSLOADIT_SIGNATURE_ALGORITHM: "md5" }), null);
});

test("signed params force one bounded upload, scan decline errors and full SHA256 of scanned output", () => {
  const signed = signedScanParams(credentials, 0);
  assert.equal(signed.signature, `sha384:${createHmac("sha384", credentials.secret).update(signed.params).digest("hex")}`);
  const params = JSON.parse(signed.params);
  assert.equal(params.auth.max_number_of_files, 1);
  assert.ok(params.auth.max_size < CLOUD_SCAN_MAX_BYTES + 1024);
  assert.equal(params.steps.scanned.error_on_decline, true);
  assert.deepEqual(params.steps.scanned.ignore_errors, []);
  assert.equal(params.steps.hashed.use, "scanned");
  assert.equal(params.steps.hashed.algorithm, "sha256");
  assert.equal(params.steps.hashed.partial, "full");
});

test("only completed single scan + exact full hash is clean", () => {
  assert.deepEqual(evaluateManagedScan(completed(), expected), { ok: true });
  assert.equal(evaluateManagedScan({ ok: "ASSEMBLY_COMPLETED", uploads: [], results: {} }, expected).ok, false);
  assert.equal(evaluateManagedScan({ ...completed(), ok: "ASSEMBLY_EXECUTING" }, expected).ok, false);
  assert.equal(evaluateManagedScan(completed("0".repeat(64)), expected).ok, false);
  assert.equal(evaluateManagedScan(completed(expected.sha256, expected.size + 1), expected).ok, false);
});

test("missing, extra, partial, warning and mismatched results fail closed", () => {
  const cases = [
    { ...completed(), warnings: [{ level: "warning", msg: "Skipped a file" }] },
    { ...completed(), error: null },
    { ...completed(), errors: ["ignored error"] },
    { ...completed(), uploads: [...completed().uploads, ...completed().uploads] },
    { ...completed(), results: { ...completed().results, scanned: [] } },
    { ...completed(), results: { ...completed().results, surprise: [] } },
    { ...completed(), results: { ...completed().results, scanned: [{ ...completed().results.scanned[0], original_id: "different" }] } },
    { ...completed(), results: { ...completed().results, hashed: [{ ...completed().results.hashed[0], meta: { hash: expected.sha256, hash_partial: "start" } }] } },
  ];
  for (const value of cases) assert.equal(evaluateManagedScan(value, expected).ok, false);
});

test("only the exact known Community notice is allowed, and never overrides a bad hash", () => {
  const notice = { level: "notice", msg: "Some files in this Assembly were auto-watermarked because you're on the Community plan. Processing is slower because of this. Upgrading to any paid plan will increase file conversion speed and remove the watermarks." };
  assert.equal(evaluateManagedScan({ ...completed(), warnings: [notice] }, expected).ok, true);
  assert.equal(evaluateManagedScan({ ...completed("bad"), warnings: [notice] }, expected).ok, false);
  assert.equal(evaluateManagedScan({ ...completed(), warnings: [{ ...notice, other: "ignored" }] }, expected).ok, false);
});

test("live-shaped mocked request posts only a server-controlled exact-byte ZIP", async () => {
  let calls = 0;
  const fetchImpl = (async (url, init) => {
    calls++;
    assert.equal(url, "https://api2.transloadit.com/assemblies");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    const body = init?.body as FormData;
    const blob = body.get("file") as File;
    assert.equal(blob.name, SCAN_ENVELOPE_NAME);
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), envelope);
    return json(completed());
  }) as typeof fetch;
  assert.deepEqual(await scanWithTransloadit(data, { credentials, fetchImpl }), { ok: true });
  assert.equal(calls, 1);
});

test("polls only the fixed trusted host, ignores provider URLs, sends no credentials in GET", async () => {
  let calls = 0;
  const fetchImpl = (async (url, init) => {
    calls++;
    if (calls === 1) return json({ assembly_id: assemblyId, ok: "ASSEMBLY_EXECUTING", assembly_ssl_url: "https://attacker.invalid/status" });
    assert.equal(url, `https://api2.transloadit.com/assemblies/${assemblyId}`);
    assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    return json(completed());
  }) as typeof fetch;
  assert.deepEqual(await scanWithTransloadit(data, { credentials, fetchImpl, wait: async () => {} }), { ok: true });
  assert.equal(calls, 2);
});

test("provider malware decline blocks benign or EICAR bytes without leaking provider text", async () => {
  const eicar = Buffer.from(["X5O!P%@AP[4", "\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-", "ANTIVIRUS-TEST-FILE!$H+H*"].join(""));
  const status = { error: "FILE_VIRUSSCAN_DECLINED_FILE", message: "private-provider-data" };
  assert.deepEqual(await scanWithTransloadit(eicar, { credentials, fetchImpl: fetchReturning(status) }), { ok: false, reason: "infected" });
});

test("quota, unknown, cancelled, invalid IDs, redirects and invalid JSON are never clean", async () => {
  for (const status of [{ error: "BILL_LIMIT_EXCEEDED" }, { error: "INVALID_SIGNATURE" }, { ok: "ASSEMBLY_CANCELED", assembly_id: assemblyId }, { ...completed(), assembly_id: "https://evil.invalid/" }]) {
    assert.equal((await scanWithTransloadit(data, { credentials, fetchImpl: fetchReturning(status) })).ok, false);
  }
  for (const response of [new Response("redirect", { status: 302 }), new Response("not json"), json({}, 429), new Response("{broken", { headers: { "content-type": "application/json" } })]) {
    assert.equal((await scanWithTransloadit(data, { credentials, fetchImpl: (async () => response) as typeof fetch })).ok, false);
  }
});

test("changed assembly identity and oversized responses fail closed", async () => {
  let calls = 0;
  const fetchImpl = (async () => ++calls === 1 ? json({ assembly_id: assemblyId, ok: "ASSEMBLY_EXECUTING" }) : json({ ...completed(), assembly_id: "b".repeat(32) })) as typeof fetch;
  assert.equal((await scanWithTransloadit(data, { credentials, fetchImpl, wait: async () => {} })).ok, false);
  assert.equal((await scanWithTransloadit(data, { credentials, fetchImpl: (async () => new Response("x".repeat(256 * 1024 + 1), { headers: { "content-type": "application/json" } })) as typeof fetch })).ok, false);
});

test("size limits refuse before network and a timed-out POST is not retried", async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls++; return new Promise<Response>(() => {}); }) as typeof fetch;
  assert.equal((await scanWithTransloadit(Buffer.alloc(CLOUD_SCAN_MAX_BYTES + 1), { credentials, fetchImpl })).ok, false);
  assert.equal((await scanWithTransloadit(Buffer.alloc(0), { credentials, fetchImpl })).ok, false);
  assert.equal(calls, 0);
  assert.equal((await scanWithTransloadit(data, { credentials, fetchImpl, requestMs: 5 })).ok, false);
  assert.equal(calls, 1);
});

test("concurrent scans reject immediately and release the slot after completion", async () => {
  let release!: (response: Response) => void;
  const pending = scanWithTransloadit(data, { credentials, fetchImpl: (async () => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch });
  const concurrent = await scanWithTransloadit(data, { credentials, fetchImpl: fetchReturning(completed()) });
  assert.equal(concurrent.ok, false);
  if (!concurrent.ok && concurrent.reason === "unavailable") assert.match(concurrent.message, /Another upload/);
  release(json(completed()));
  assert.deepEqual(await pending, { ok: true });
  assert.deepEqual(await scanWithTransloadit(data, { credentials, fetchImpl: fetchReturning(completed()) }), { ok: true });
});
