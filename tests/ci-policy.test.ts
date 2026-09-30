import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const source = workflow.replace(/^\s*#.*$/gm, "");

// These are regression checks for the reviewed workflow, not a sandbox against
// a malicious PR. Repository permissions and maintainer review are separate
// controls; this file does not configure GitHub branch protection.
test("contributor checks use unprivileged PR events and disposable hosted runners", () => {
  assert.match(source, /\n  pull_request:\s*\n/);
  assert.match(source, /permissions:\s+contents: read\s+concurrency:/);
  assert.match(source, /runs-on: ubuntu-24\.04/);
  assert.match(source, /timeout-minutes: 25/);
  assert.doesNotMatch(source, /pull_request_target|workflow_run|self-hosted|\benvironment:|\bservices:/);
  assert.doesNotMatch(source, /secrets\.|vars\.|github\.token|id-token:|contents: write|actions: write/);
});

test("contributor dependencies and actions cannot retain credentials or cross-run caches", () => {
  const actions = [...source.matchAll(/uses: (\S+)/g)].map((match) => match[1]);
  assert.equal(actions.length, 2);
  assert.match(actions[0], /^actions\/checkout@[0-9a-f]{40}$/);
  assert.match(actions[1], /^actions\/setup-node@[0-9a-f]{40}$/);
  assert.match(source, /persist-credentials: false/);
  assert.match(source, /package-manager-cache: false/);
  assert.match(source, /node-version: '22'/);
  assert.match(source, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(source, /\n\s+cache:|upload-artifact|download-artifact/);
});

test("contributor gates generate route types and cover both isolated build profiles", () => {
  assert.match(source, /profile: \[default, cloud\]/);
  assert.match(source, /BETAMODS_BUILD_CHECK: '1'/);
  assert.match(source, /NEXT_TELEMETRY_DISABLED: '1'/);
  assert.match(source, /CLOUD_PILOT: \$\{\{ matrix\.profile == 'cloud' && 'on' \|\| 'off' \}\}/);
  const commands = [...source.matchAll(/run: (.+)/g)].map((match) => match[1]);
  assert.deepEqual(commands, [
    "npm ci --ignore-scripts --no-audit --no-fund",
    "npm test",
    "npm run lint",
    "node node_modules/next/dist/bin/next typegen",
    "npm run typecheck",
    "npm run build",
  ]);
  assert.doesNotMatch(source, /continue-on-error|test:integration|e2e|drizzle|DATABASE_URL|STORAGE_SECRET_KEY|TRANSLOADIT_SECRET|RESEND_API_KEY/);
});
