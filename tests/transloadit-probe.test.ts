import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { before, describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";

type Module = typeof import("../scripts/transloadit-probe-core.mjs");
type Fixture = Awaited<ReturnType<Module["createFixtures"]>>[number];
let probe: Module;
let fixtures: Fixture[];
before(async () => {
  probe = await import("../scripts/transloadit-probe-core.mjs");
  fixtures = await probe.createFixtures();
});

const credentials = { key: "synthetic-key-1234567890", secret: "synthetic-secret-1234567890", algorithm: "sha384" };
const assemblyId = "a".repeat(32);
const uploadId = "b".repeat(32);
const communityNotice = {
  level: "notice",
  msg: "Some files in this Assembly were auto-watermarked because you're on the Community plan. Processing is slower because of this. Upgrading to any paid plan will increase file conversion speed and remove the watermarks.",
};
function complete(fixture: Fixture) {
  const file = {
    id: uploadId, original_id: uploadId, original_name: fixture.name,
    name: fixture.name, size: fixture.size, field: "file",
  };
  return {
    assembly_id: assemblyId, ok: "ASSEMBLY_COMPLETED", warnings: [], uploads: [{ ...file }],
    results: { scanned: [{ ...file }], hashed: [{ ...file, meta: { hash: fixture.sha256 } }] },
  };
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("isolated Transloadit probe consent and fixtures", () => {
  it("defaults to dry-run, requires the exact live flag, and rejects user files/endpoints", () => {
    assert.equal(probe.parseArgs([]).live, false);
    assert.equal(probe.parseArgs(["--dry-run"]).live, false);
    assert.equal(probe.parseArgs(["--live"]).live, true);
    assert.equal(probe.parseArgs(["--live", "--credentials=env"]).credentials, "env");
    for (const args of [["--live=false"], ["--live", "--dry-run"], ["--live", "--live"], ["mod.zip"], ["--file=mod.zip"], ["--endpoint=https://example.com"], ["--env-file=.env.local"]]) {
      assert.throws(() => probe.parseArgs(args));
    }
  });

  it("never falls back to unrelated env keys or interpolates credentials", () => {
    assert.deepEqual(probe.parseCredentialFile('TRANSLOADIT_KEY="synthetic-key-1234567890"\nTRANSLOADIT_SECRET=synthetic-secret-1234567890\n'), credentials);
    for (const text of ["DATABASE_URL=secret", "TRANSLOADIT_KEY=${OTHER_KEY}", "TRANSLOADIT_KEY=x\nTRANSLOADIT_KEY=y", "export TRANSLOADIT_KEY=secret"]) {
      assert.throws(() => probe.parseCredentialFile(text));
    }
    assert.throws(() => probe.credentialsFrom({ DATABASE_URL: "secret" }));
  });

  it("accepts eight-character named keys and only explicit SHA256 or SHA384 algorithms", () => {
    const values = { TRANSLOADIT_KEY: "test-key", TRANSLOADIT_SECRET: credentials.secret };
    assert.equal(probe.credentialsFrom(values).algorithm, "sha384");
    assert.deepEqual(probe.parseCredentialFile(`TRANSLOADIT_KEY=test-key\nTRANSLOADIT_SECRET=${credentials.secret}\nTRANSLOADIT_SIGNATURE_ALGORITHM=sha256\n`), {
      key: "test-key", secret: credentials.secret, algorithm: "sha256",
    });
    for (const algorithm of ["sha1", "SHA256", "", "sha512", "${OTHER}"]) {
      assert.throws(() => probe.credentialsFrom({ ...values, TRANSLOADIT_SIGNATURE_ALGORITHM: algorithm }), /unsupported-signature-algorithm/);
    }
    assert.throws(() => probe.credentialsFrom({ ...values, TRANSLOADIT_KEY: "shorter" }));
    assert.throws(() => probe.credentialsFrom({ ...values, TRANSLOADIT_SECRET: "short-secret" }));
  });

  it("generates only bounded deterministic synthetic fixtures in memory", async () => {
    assert.deepEqual(fixtures.map(f => f.name), ["benign-text.txt", "harmless.zip", "eicar.txt", "eicar.zip", "nested-eicar.zip", "malformed.zip", "pixel.png", "image-envelope.zip", "eicar-image-envelope.zip"]);
    assert.ok(fixtures.every(f => f.size < 64 * 1024));
    assert.equal(fixtures[2].size, 68);
    assert.equal(createHash("md5").update(fixtures[2].bytes).digest("hex"), "44d88612fea8a8f36de82e1278abb02f");
    assert.deepEqual((await probe.createFixtures()).map(probe.describeFixture), fixtures.map(probe.describeFixture));
    assert.ok(probe.LIMITATIONS.some(line => line.includes("250 MiB")));
  });

  it("uses an actually decodable PNG for the image byte-preservation probe", async () => {
    const { default: sharp } = await import("sharp");
    const decoded = await sharp(fixtures[6].bytes).raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, 1);
    assert.equal(decoded.info.height, 1);
    assert.deepEqual([...decoded.data], [32, 64, 128, 255]);
  });

  it("carries the exact PNG and disguised EICAR bytes in single-entry ZIP envelopes", () => {
    for (const [index, payload, expected] of [[7, fixtures[6].bytes, "accept"], [8, fixtures[2].bytes, "virus-decline"]] as const) {
      const fixture = fixtures[index];
      const bytes = fixture.bytes;
      const end = bytes.length - 22;
      assert.equal(bytes.readUInt32LE(end), 0x06054b50);
      assert.equal(bytes.readUInt16LE(end + 10), 1);
      const central = bytes.readUInt32LE(end + 16);
      assert.equal(bytes.readUInt32LE(central), 0x02014b50);
      assert.equal(bytes.readUInt16LE(central + 10), 8);
      const local = bytes.readUInt32LE(central + 42);
      const nameLength = bytes.readUInt16LE(local + 26);
      assert.equal(bytes.subarray(local + 30, local + 30 + nameLength).toString(), "pixel.png");
      const dataStart = local + 30 + nameLength + bytes.readUInt16LE(local + 28);
      const compressedLength = bytes.readUInt32LE(central + 20);
      assert.deepEqual(inflateRawSync(bytes.subarray(dataStart, dataStart + compressedLength)), payload);
      assert.equal(fixture.expected, expected);
    }
  });

  it("dry-run and help run without credentials, with no app env loading", async () => {
    const run = promisify(execFile);
    const env = { ...process.env, TRANSLOADIT_KEY: "invalid-do-not-use", TRANSLOADIT_SECRET: "invalid-do-not-print" };
    const { stdout, stderr } = await run(process.execPath, ["scripts/transloadit-probe.mjs"], { cwd: process.cwd(), env, timeout: 10_000 });
    const report = JSON.parse(stdout);
    assert.equal(report.liveExecuted, false);
    assert.equal(report.mode, "dry-run");
    assert.equal(report.fixtures.length, 9);
    assert.doesNotMatch(stdout + stderr, /invalid-do-not/);
    const help = await run(process.execPath, ["scripts/transloadit-probe.mjs", "--help"], { cwd: process.cwd(), env, timeout: 10_000 });
    assert.match(help.stdout, /possible charges/);
  });

  it("signs the exact serialized instructions using SHA384, fresh nonces and strict robots", () => {
    const signed = probe.signedParams(credentials, Date.UTC(2026, 8, 29));
    assert.equal(signed.signature, `sha384:${createHmac("sha384", credentials.secret).update(signed.params).digest("hex")}`);
    const params = JSON.parse(signed.params);
    assert.equal(params.auth.expires, "2026-09-29T00:05:00.000Z");
    assert.equal(params.auth.max_number_of_files, 1);
    assert.deepEqual(params.steps.scanned, { robot: "/file/virusscan", use: ":original", error_on_decline: true, result: true, ignore_errors: [] });
    assert.equal(params.steps.hashed.algorithm, "sha256");
    assert.equal(params.steps.hashed.partial, "full");
    assert.notEqual(params.nonce, JSON.parse(probe.signedParams(credentials).params).nonce);
  });

  it("uses an explicitly configured SHA256 signer without algorithm fallback", () => {
    const signed = probe.signedParams({ ...credentials, algorithm: "sha256" });
    assert.equal(signed.signature, `sha256:${createHmac("sha256", credentials.secret).update(signed.params).digest("hex")}`);
    const defaultSigned = probe.signedParams({ key: credentials.key, secret: credentials.secret });
    assert.match(defaultSigned.signature, /^sha384:/);
    assert.throws(() => probe.signedParams({ ...credentials, algorithm: "sha1" }), /unsupported-signature-algorithm/);
  });
});

describe("Transloadit response evidence fails closed", () => {
  it("requires a completed, uniquely bound scan and matching provider SHA256", () => {
    assert.deepEqual(probe.evaluateAssembly(complete(fixtures[0]), fixtures[0]), { accepted: true, observation: "scan-result-confirmed", providerSha256: "matches-local" });
    for (const fixture of fixtures.filter(f => f.expected !== "accept")) {
      assert.equal(probe.evaluateAssembly(complete(fixture), fixture).observation, "unexpected-acceptance");
      assert.equal(probe.evaluateAssembly(complete(fixture), fixture).accepted, false);
    }
  });

  it("rejects malformed, missing, extra, mismatched, skipped or partial evidence", () => {
    const bad: unknown[] = [null, [], {}, { ok: "ASSEMBLY_COMPLETED" }];
    for (const status of ["ASSEMBLY_UPLOADING", "ASSEMBLY_EXECUTING", "ASSEMBLY_ABORTED", "ASSEMBLY_CANCELED", "UNKNOWN"]) {
      bad.push({ ...complete(fixtures[0]), ok: status });
    }
    const missing = complete(fixtures[0]); missing.results.scanned = []; bad.push(missing);
    const extra = complete(fixtures[0]); extra.results.scanned.push({ ...extra.results.scanned[0] }); bad.push(extra);
    const extraUpload = complete(fixtures[0]); extraUpload.uploads.push({ ...extraUpload.uploads[0] }); bad.push(extraUpload);
    const wrongFile = complete(fixtures[0]); wrongFile.results.scanned[0].original_id = "wrong"; bad.push(wrongFile);
    const wrongName = complete(fixtures[0]); wrongName.uploads[0].name = "another.txt"; bad.push(wrongName);
    const wrongSize = complete(fixtures[0]); wrongSize.results.scanned[0].size++; bad.push(wrongSize);
    const wrongField = complete(fixtures[0]); wrongField.results.scanned[0].field = "other"; bad.push(wrongField);
    const wrongHash = complete(fixtures[0]); wrongHash.results.hashed[0].meta.hash = "0".repeat(64); bad.push(wrongHash);
    const missingHash = complete(fixtures[0]); missingHash.results.hashed = []; bad.push(missingHash);
    const partialHash = complete(fixtures[0]); Object.assign(partialHash.results.hashed[0].meta, { hash_partial: "first" }); bad.push(partialHash);
    const unexpectedStep = complete(fixtures[0]); Object.assign(unexpectedStep.results, { ignored: [] }); bad.push(unexpectedStep);
    const resultError = complete(fixtures[0]); Object.assign(resultError.results.scanned[0], { error: "ignored" }); bad.push(resultError);
    bad.push({ ...complete(fixtures[0]), warnings: ["limits exceeded"] });
    bad.push({ ...complete(fixtures[0]), warnings: "invalid" });
    bad.push({ ...complete(fixtures[0]), errors: ["scan failed"] });
    bad.push({ ...complete(fixtures[0]), error: "" });
    for (const status of bad) assert.equal(probe.evaluateAssembly(status, fixtures[0]).accepted, false);
  });

  it("recognizes only the exact Community notice and still requires final scan and full hash evidence", () => {
    const withNotice = { ...complete(fixtures[0]), warnings: [{ ...communityNotice }] };
    const accepted = probe.evaluateAssembly(withNotice, fixtures[0]);
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.communityWatermarkNotice, true);
    assert.doesNotMatch(JSON.stringify(accepted), /auto-watermarked|Upgrading|Community/);
    assert.equal(probe.evaluateAssembly({ ...withNotice, ok: "ASSEMBLY_EXECUTING" }, fixtures[0]).accepted, false);
    const missing = structuredClone(withNotice); missing.results.scanned = [];
    assert.equal(probe.evaluateAssembly(missing, fixtures[0]).accepted, false);
    const wrongHash = structuredClone(withNotice); wrongHash.results.hashed[0].meta.hash = "0".repeat(64);
    assert.equal(probe.evaluateAssembly(wrongHash, fixtures[0]).observation, "sha256-mismatch");
    const wrongFile = structuredClone(withNotice); wrongFile.results.scanned[0].original_id = "wrong";
    assert.equal(probe.evaluateAssembly(wrongFile, fixtures[0]).accepted, false);
    const partialHash = structuredClone(withNotice); Object.assign(partialHash.results.hashed[0].meta, { hash_partial: "first" });
    assert.equal(probe.evaluateAssembly(partialHash, fixtures[0]).accepted, false);
    for (const warnings of [
      [{ ...communityNotice, level: "warning" }],
      [{ ...communityNotice, msg: communityNotice.msg + " " }],
      [{ ...communityNotice, extra: "unsupported" }],
      [{ ...communityNotice }, { level: "notice", msg: "archive scan limit reached" }],
      [{ level: "notice", msg: "unknown informational message" }],
      null, {}, "invalid",
    ]) assert.equal(probe.evaluateAssembly({ ...withNotice, warnings }, fixtures[0]).accepted, false);
    assert.equal(probe.evaluateAssembly({ ...withNotice, error: "INTERNAL_COMMAND_TIMEOUT" }, fixtures[0]).accepted, false);
    assert.equal(probe.evaluateAssembly({ ...withNotice, errors: ["failure"] }, fixtures[0]).accepted, false);
    const resultNotice = complete(fixtures[0]); Object.assign(resultNotice.results.scanned[0], { warnings: [communityNotice] });
    assert.equal(probe.evaluateAssembly(resultNotice, fixtures[0]).accepted, false);
  });

  it("distinguishes virus detection from quota, invalid-input and arbitrary errors", () => {
    const virus = probe.evaluateAssembly({ error: "FILE_VIRUSSCAN_DECLINED_FILE" }, fixtures[2]);
    assert.equal(virus.accepted, false);
    assert.equal(probe.expectationMet(fixtures[2], virus), true);
    for (const error of ["BILL_LIMIT_EXCEEDED", "PLAN_LIMIT_EXCEEDED", "FILE_VIRUSSCAN_INVALID_INPUT", "INTERNAL_COMMAND_TIMEOUT", "unknown-secret-url"]) {
      const result = probe.evaluateAssembly({ ...complete(fixtures[2]), error, message: "credential-secret-url" }, fixtures[2]);
      assert.equal(result.accepted, false);
      assert.equal(probe.expectationMet(fixtures[2], result), false);
      assert.doesNotMatch(JSON.stringify(result), /secret-url/);
    }
    assert.equal(probe.expectationMet(fixtures[5], probe.evaluateAssembly({ error: "FILE_VIRUSSCAN_INVALID_INPUT" }, fixtures[5])), true);
  });
});

describe("Transloadit transport uses mocks only", () => {
  it("requires consent and an original, unmodified generated fixture before transport", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; throw new Error("should not be called"); };
    await assert.rejects(probe.scanFixture(fixtures[0], credentials, { fetchImpl }), /live-consent-required/);
    await assert.rejects(probe.scanFixture({ ...fixtures[0] }, credentials, { live: true, fetchImpl }), /synthetic-fixtures-only/);
    const changed = (await probe.createFixtures())[0]; changed.bytes[0] ^= 1;
    await assert.rejects(probe.scanFixture(changed, credentials, { live: true, fetchImpl }), /synthetic-fixtures-only/);
    assert.equal(calls, 0);
  });

  it("never follows server URLs or sends credentials with polling GETs", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return response(calls.length === 1 ? {
        assembly_id: assemblyId, ok: "ASSEMBLY_EXECUTING", assembly_ssl_url: "https://evil.example/steal?secret=hidden", result_url: "http://127.0.0.1/",
      } : complete(fixtures[0]));
    };
    const result = await probe.scanFixture(fixtures[0], credentials, { live: true, fetchImpl, wait: async () => {} });
    assert.equal(result.accepted, true);
    assert.deepEqual(calls.map(c => c.url), ["https://api2.transloadit.com/assemblies", `https://api2.transloadit.com/assemblies/${assemblyId}`]);
    assert.ok(calls.every(c => c.init.redirect === "error" && c.init.credentials === "omit"));
    assert.equal(calls[1].init.method, "GET");
    assert.equal(calls[1].init.body, undefined);
    assert.deepEqual(calls[1].init.headers, { Accept: "application/json" });
    const body = calls[0].init.body as FormData;
    assert.equal((body.get("file") as File).size, fixtures[0].size);
    assert.doesNotMatch(JSON.stringify(result), /hidden|evil|secret|assemblies/);
    for (const id of ["../outside", "https://evil.example", "a".repeat(31), "A".repeat(32), "a".repeat(32) + "?x=y"]) assert.throws(() => probe.statusUrl(id));
  });

  it("rejects wrong Assembly identity while polling", async () => {
    let calls = 0;
    const result = await probe.scanFixture(fixtures[0], credentials, {
      live: true, wait: async () => {}, fetchImpl: async () => response(++calls === 1
        ? { assembly_id: assemblyId, ok: "ASSEMBLY_EXECUTING" }
        : { ...complete(fixtures[0]), assembly_id: "c".repeat(32) }),
    });
    assert.equal(result.observation, "assembly-mismatch");
  });

  it("polls past the exact Community notice without accepting an executing Assembly", async () => {
    let calls = 0;
    const result = await probe.scanFixture(fixtures[0], credentials, {
      live: true, wait: async () => {}, fetchImpl: async () => response(++calls === 1
        ? { assembly_id: assemblyId, ok: "ASSEMBLY_EXECUTING", warnings: [communityNotice] }
        : complete(fixtures[0])),
    });
    assert.equal(calls, 2);
    assert.equal(result.accepted, true);
    assert.equal(result.communityWatermarkNotice, true);
    calls = 0;
    const unknown = await probe.scanFixture(fixtures[0], credentials, {
      live: true, fetchImpl: async () => { calls++; return response({ assembly_id: assemblyId, ok: "ASSEMBLY_EXECUTING", warnings: [{ level: "notice", msg: "unknown" }] }); },
    });
    assert.equal(unknown.accepted, false);
    assert.equal(calls, 1);
    calls = 0;
    const laterWarning = await probe.scanFixture(fixtures[0], credentials, {
      live: true, wait: async () => {}, fetchImpl: async () => response(++calls === 1
        ? { assembly_id: assemblyId, ok: "ASSEMBLY_EXECUTING", warnings: [communityNotice] }
        : { assembly_id: assemblyId, ok: "ASSEMBLY_EXECUTING", warnings: [{ level: "notice", msg: "unknown" }] }),
    });
    assert.equal(laterWarning.accepted, false);
    assert.equal(laterWarning.communityWatermarkNotice, true);
    assert.equal(calls, 2);
  });

  it("handles quota, malformed JSON, redirects, oversized and HTTP failures without POST retries", async () => {
    const responses = [
      () => response({ error: "BILL_LIMIT_EXCEEDED", message: "secret" }, 403),
      () => response({}, 429),
      () => new Response("{", { headers: { "content-type": "application/json" } }),
      () => new Response("", { status: 302, headers: { location: "https://evil.example" } }),
      () => new Response("<html>secret</html>", { headers: { "content-type": "text/html" } }),
      () => new Response(" ".repeat(256 * 1024 + 1), { headers: { "content-type": "application/json" } }),
      () => response({}, 500),
      () => response({ ok: "ASSEMBLY_EXECUTING", assembly_id: "https://evil.example" }),
    ];
    for (const makeResponse of responses) {
      let calls = 0;
      const result = await probe.scanFixture(fixtures[0], credentials, { live: true, fetchImpl: async () => { calls++; return makeResponse(); } });
      assert.equal(result.accepted, false);
      assert.equal(calls, 1);
      assert.doesNotMatch(JSON.stringify(result), /secret|evil/);
    }
  });

  it("bounds stalled POSTs and body reads, aborts them, and never retries", async () => {
    for (const stalledBody of [false, true]) {
      let calls = 0;
      let signal: AbortSignal | null | undefined;
      const result = await probe.scanFixture(fixtures[0], credentials, {
        live: true, requestMs: 15, totalMs: 100,
        fetchImpl: async (_url: string, init: RequestInit) => {
          calls++; signal = init.signal;
          if (!stalledBody) return new Promise<Response>(() => {});
          return new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } });
        },
      });
      assert.equal(result.observation, "timeout");
      assert.equal(signal?.aborted, true);
      assert.equal(calls, 1);
    }
  });

  it("bounds executing Assemblies and redacts thrown transport failures", async () => {
    let time = 0;
    let calls = 0;
    const timedOut = await probe.scanFixture(fixtures[0], credentials, {
      live: true, totalMs: 5_000, now: () => time, wait: async (ms: number) => { time += ms; },
      fetchImpl: async () => { calls++; return response({ assembly_id: assemblyId, ok: "ASSEMBLY_EXECUTING" }); },
    });
    assert.equal(timedOut.observation, "timeout");
    assert.ok(calls <= 3);
    const failed = await probe.scanFixture(fixtures[0], credentials, { live: true, fetchImpl: async () => { throw new Error("secret https://evil.example"); } });
    assert.deepEqual(failed, { accepted: false, observation: "network-error", providerSha256: "unverified" });
  });
});
