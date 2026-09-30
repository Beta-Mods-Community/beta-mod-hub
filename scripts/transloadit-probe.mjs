#!/usr/bin/env node
/** Run with --help. Default dry-run does not read credentials or contact services. */
import { readFile, lstat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  LIMITATIONS, ProbeError, parseArgs, parseCredentialFile, credentialsFrom,
  createFixtures, describeFixture, scanFixture, expectationMet,
} from "./transloadit-probe-core.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const credentialFile = fileURLToPath(new URL("../.env.transloadit.local", import.meta.url));

async function loadCredentials(source) {
  if (source === "env") return credentialsFrom(process.env);
  // Refuse tracked/unignored credentials and links. Never fall back to app envs.
  try {
    await promisify(execFile)("git", ["check-ignore", "--quiet", "--", ".env.transloadit.local"], { cwd: root, timeout: 5_000 });
    const stat = await lstat(credentialFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4_096) throw new Error();
    return parseCredentialFile(await readFile(credentialFile, "utf8"));
  } catch (error) {
    if (error instanceof ProbeError) throw error;
    throw new ProbeError("dedicated-credential-file-required-and-must-be-gitignored");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Synthetic Transloadit evaluation (no app integration)
  node scripts/transloadit-probe.mjs                   Dry run: no secrets or network
  node scripts/transloadit-probe.mjs --live            Upload nine synthetic fixtures
  node scripts/transloadit-probe.mjs --live --credentials=env

--live explicitly permits provider uploads and possible charges. Fixtures include
benign text/ZIP/PNG, standard inert EICAR text/ZIP/nested ZIP, a malformed ZIP,
and two ZIP envelopes containing the PNG or EICAR bytes under the name pixel.png.
No fixture bytes are written to disk. Real file paths and URLs are never accepted.

Default live credentials: gitignored .env.transloadit.local at the repo root,
containing TRANSLOADIT_KEY and TRANSLOADIT_SECRET, and optionally
TRANSLOADIT_SIGNATURE_ALGORITHM=sha256 or sha384 (default sha384). Match the
algorithm configured for that key in the dashboard; algorithms are never retried
or downgraded automatically. Use a dedicated test key with assemblies:write.
--credentials=env uses only those three process variables. There is no .env.local
or production fallback.

Live runs make at most nine creation requests, sequentially, with no POST retries.
Each fixture has a 120-second deadline, 15-second request timeout and 64 KiB cap.
Outputs omit credentials, provider bodies, Assembly IDs and all result/status URLs.
The exact known Community-plan watermark notice is reported as a boolean; scan
and full SHA256 matching remain mandatory. All other notices or warnings fail.
Exit 0 means dry-run or observed fixture expectations; exit 1 means incomplete or
unexpected live evidence; exit 2 means configuration error. None is launch approval.
${LIMITATIONS.join("\n")}`);
    return;
  }
  const credentials = options.live ? await loadCredentials(options.credentials) : null;
  const fixtures = await createFixtures();
  console.log(JSON.stringify({
    mode: options.live ? "live-synthetic-evaluation" : "dry-run", liveExecuted: options.live,
    limitations: LIMITATIONS, fixtures: fixtures.map(describeFixture),
  }, null, 2));
  if (!options.live) return;
  let failed = false;
  for (const fixture of fixtures) {
    const result = await scanFixture(fixture, credentials, { live: true });
    const met = expectationMet(fixture, result);
    failed ||= !met;
    console.log(JSON.stringify({ fixture: fixture.name, ...result, expectationMet: met, independentBytePreservation: "unverified" }));
    // Do not spend the remaining quota when the credential, account or service failed.
    if (["authentication-error", "quota-or-rate-limit", "network-error", "timeout", "http-error"].includes(result.observation)) {
      failed = true;
      console.log(JSON.stringify({ remainingFixtures: "not-run", reason: "stopped-after-service-error" }));
      break;
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch(error => {
  console.error(JSON.stringify({ error: error instanceof ProbeError ? error.code : "probe-failed", liveEvidence: "incomplete" }));
  process.exitCode = 2;
});
