#!/usr/bin/env node
/**
 * Synthetic-only verification of the actual production managed-scan adapter.
 * node --conditions=react-server --import tsx scripts/cloud-scan-smoke.mjs --live
 * Without --live: no credentials are read and no network requests are made.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { scanWithTransloadit, transloaditCredentials } from "../lib/transloadit-scan.ts";
import { CLOUD_SCAN_MAX_BYTES, createScanEnvelope, SCAN_ENVELOPE_OVERHEAD } from "../lib/cloud-zip.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const privateFile = fileURLToPath(new URL("../.env.transloadit.local", import.meta.url));

class SmokeConfigError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** No file, URL, environment-source or endpoint overrides are supported. */
export function parseSmokeArgs(args) {
  const options = { live: false, boundary: false, media: false, help: false };
  const seen = new Set();
  for (const arg of args) {
    if (seen.has(arg)) throw new SmokeConfigError("duplicate-option");
    seen.add(arg);
    if (arg === "--live") options.live = true;
    else if (arg === "--boundary") options.boundary = true;
    else if (arg === "--media") options.media = true;
    else if (arg === "--help") options.help = true;
    else throw new SmokeConfigError("unsupported-option");
  }
  return options;
}

/** Dedicated file only, with the dashboard signing algorithm explicitly set. */
export function parseSmokeCredentials(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(TRANSLOADIT_KEY|TRANSLOADIT_SECRET|TRANSLOADIT_SIGNATURE_ALGORITHM)\s*=\s*(.*?)\s*$/.exec(trimmed);
    if (!match || Object.hasOwn(values, match[1])) throw new SmokeConfigError("invalid-dedicated-credential-file");
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  const credentials = transloaditCredentials(values);
  if (!credentials) throw new SmokeConfigError("dedicated-credentials-and-explicit-algorithm-required");
  return credentials;
}

async function loadDedicatedCredentials() {
  try {
    await promisify(execFile)("git", ["check-ignore", "--quiet", "--", ".env.transloadit.local"], { cwd: root, timeout: 5_000 });
    const stat = await lstat(privateFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4_096) throw new SmokeConfigError("dedicated-file-must-be-private-regular-file");
    return parseSmokeCredentials(await readFile(privateFile, "utf8"));
  } catch (error) {
    if (error instanceof SmokeConfigError) throw error;
    throw new SmokeConfigError("gitignored-dedicated-credential-file-required");
  }
}

/** Everything originates in memory; never reads a mod, image or uploaded file. */
export async function createSmokeFixtures(options = {}) {
  const png = await sharp({ create: { width: 160, height: 160, channels: 4, background: { r: 40, g: 170, b: 200, alpha: 1 } } }).png().toBuffer();
  // Standard inert antivirus test marker, assembled only in process memory.
  const eicar = Buffer.from(["X5O!P%@AP[4", "\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-", "ANTIVIRUS-TEST-FILE!$H+H*"].join(""));
  const fixtures = [
    { name: "benign-text", bytes: Buffer.from("Synthetic Beta Mods managed-scanner check. No real user content.\n"), expected: "clean" },
    { name: "generated-160x160-png", bytes: png, expected: "clean" },
    { name: "eicar-plain", bytes: eicar, expected: "infected" },
    // The adapter creates an additional envelope, exercising its nested ZIP path.
    { name: "eicar-in-zip", bytes: createScanEnvelope(eicar), expected: "infected" },
  ];
  if (options.media) fixtures.push({ name: "generated-canonical-webp", bytes: await sharp(png).webp({ quality: 82 }).toBuffer(), expected: "clean" });
  if (options.boundary) {
    const bytes = createScanEnvelope(randomBytes(CLOUD_SCAN_MAX_BYTES - SCAN_ENVELOPE_OVERHEAD));
    if (bytes.length !== CLOUD_SCAN_MAX_BYTES) throw new SmokeConfigError("boundary-fixture-size-mismatch");
    fixtures.push({ name: "synthetic-8MiB-stored-zip", bytes, expected: "clean" });
  }
  return fixtures;
}

async function main() {
  const options = parseSmokeArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Actual cloud-scan adapter verification, synthetic files only

  node --conditions=react-server --import tsx scripts/cloud-scan-smoke.mjs
  node --conditions=react-server --import tsx scripts/cloud-scan-smoke.mjs --live

Default is a dry run: no secrets read, no network calls.
--live acknowledges four small Transloadit Assemblies, consuming provider
processing allowance: benign text, generated 160x160 PNG, inert EICAR plain,
and EICAR inside a generated ZIP. The adapter wraps each input in another ZIP.
--media adds one generated canonical WebP check (five jobs with --live).
--boundary adds one synthetic 8 MiB stored-ZIP check; expect it to take longer.
Both optional flags together produce six jobs. No POST retries; sequential jobs,
at most 120 seconds each, 30 seconds per HTTP request, stopping on first failure.

Credentials are read ONLY from gitignored .env.transloadit.local. It must contain
TRANSLOADIT_KEY, TRANSLOADIT_SECRET and TRANSLOADIT_SIGNATURE_ALGORITHM=sha256 or
sha384 matching the dashboard. No process-env or app/production-env fallback.

The script calls the actual adapter, not scanUpload(): it does not touch the app,
database, object storage, DNS or the app's monthly scan-budget ledger. Processing
IS counted in the provider dashboard. Keep Community / no card; never upgrade.
No real files, provider IDs, URLs, credential values or upstream bodies are logged.
Exit 0: dry-run or all requested expectations passed. Exit 1: live check failed.
Exit 2: local configuration/setup error. Passing is scanner evidence, not launch
approval, malware-free certification or proof of arbitrary archive coverage.`);
    return;
  }
  const fixtures = await createSmokeFixtures(options);
  console.log(JSON.stringify({
    mode: options.live ? "live-synthetic-adapter-verification" : "dry-run",
    plannedJobs: fixtures.length,
    perJobDeadlineSeconds: 120,
    appScanBudgetCharged: false,
    liveRequestsConsumeProviderAllowance: options.live,
    fixtures: fixtures.map(({ name, bytes, expected }) => ({ name, inputBytes: bytes.length, expected })),
  }, null, 2));
  if (!options.live) return;
  const credentials = await loadDedicatedCredentials();
  let passed = 0;
  for (const fixture of fixtures) {
    console.log(JSON.stringify({ fixture: fixture.name, progress: "starting" }));
    const started = Date.now();
    const result = await scanWithTransloadit(fixture.bytes, { credentials, totalMs: 120_000, requestMs: 30_000 });
    const observed = result.ok ? "clean" : result.reason;
    const success = observed === fixture.expected;
    console.log(JSON.stringify({ fixture: fixture.name, passed: success, observed, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));
    if (!success) {
      console.log(JSON.stringify({ passed, planned: fixtures.length, remaining: "not-run", reason: "stopped-after-unexpected-result" }));
      process.exitCode = 1;
      return;
    }
    passed++;
  }
  console.log(JSON.stringify({ passed, planned: fixtures.length, providerUsage: "See the Transloadit Community dashboard; app ledger intentionally unchanged.", publicLaunchReady: false }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => {
    console.error(JSON.stringify({ error: error instanceof SmokeConfigError ? error.code : "cloud-scan-smoke-failed", evidence: "incomplete" }));
    process.exitCode = 2;
  });
}
