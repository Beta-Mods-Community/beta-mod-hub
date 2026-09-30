import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type Module = typeof import("../scripts/cloud-backup-retention.mjs");
let retention: Module;
before(async () => { retention = await import("../scripts/cloud-backup-retention.mjs"); });

const artifact = (id: number, runId = id, attempt = 1, extra = {}) => ({
  id, name: `cloud-backup-v1-${runId}-${attempt}`, size_in_bytes: 100 * 1024 * 1024,
  expired: false, created_at: new Date(Date.UTC(2026, 8, id)).toISOString(),
  workflow_run: { id: runId }, ...extra,
});
const run = (id: number, extra = {}) => ({
  id, run_attempt: 1, path: ".github/workflows/cloud-backup.yml",
  repository: { full_name: "Beta-Mods/beta-mod-hub" }, head_branch: "main",
  event: "schedule", status: "completed", conclusion: "success", ...extra,
});

describe("cloud backup artifact accounting and retention", () => {
  it("reserves 150 MiB across all repository artifacts, not just backup names", () => {
    assert.equal(retention.artifactBudget([artifact(1), artifact(2)]), 200 * retention.MIB);
    assert.throws(() => retention.artifactBudget([
      artifact(1), artifact(2), artifact(3, 3, 1, { name: "unrelated", size_in_bytes: 101 * retention.MIB }),
    ]), /450 MiB/);
    assert.doesNotThrow(() => retention.artifactBudget([
      artifact(1, 1, 1, { size_in_bytes: 300 * retention.MIB }),
    ]));
  });
  it("ignores expired billing entries but fails closed on unknown or duplicate accounting", () => {
    assert.equal(retention.artifactBudget([artifact(1, 1, 1, { expired: true })]), 0);
    assert.throws(() => retention.artifactBudget([artifact(1), artifact(1)]), /invalid accounting/);
    assert.throws(() => retention.artifactBudget([artifact(1, 1, 1, { size_in_bytes: -1 })]), /invalid accounting/);
    assert.throws(() => retention.artifactBudget([artifact(1, 1, 1, { expired: undefined })]), /invalid accounting/);
  });
  it("allows at most a third temporary copy even when failed artifacts are tiny", () => {
    assert.doesNotThrow(() => retention.preflightArtifactBudget([artifact(1), artifact(2)]));
    assert.throws(() => retention.preflightArtifactBudget([1, 2, 3].map((id) =>
      artifact(id, id, 1, { size_in_bytes: 1 }))), /More than two/);
  });
  it("requires exact numeric run and attempt artifact names", () => {
    assert.deepEqual(retention.parseBackupName("cloud-backup-v1-123-2"), { runId: 123, attempt: 2 });
    for (const value of ["cloud-backup-v1-0-1", "cloud-backup-v1-1-0", "cloud-backup-v1-1-1.zip", "cloud-backup-v1-999999999999999999999-1", "elsewhere"]) {
      assert.equal(retention.parseBackupName(value), null);
    }
  });
  it("will not delete any old copy before the downloaded replacement was restored", () => {
    const rows = [artifact(1), artifact(2), artifact(3)];
    const runs = new Map(rows.map((row) => [`${row.id}:1`, run(row.id)]));
    assert.throws(() => retention.planRetention(rows, runs, 3, 3, 1, false), /restore verification/);
  });
  it("keeps exactly replacement plus newest prior successful backup", () => {
    const rows = [artifact(1), artifact(2), artifact(3)];
    const runs = new Map(rows.map((row) => [`${row.id}:1`, run(row.id)]));
    assert.deepEqual(retention.planRetention(rows, runs, 3, 3, 1, true), { keepIds: [3, 2], deleteIds: [1] });
  });
  it("preserves last good copy when a newer prior run failed", () => {
    const rows = [artifact(1), artifact(2), artifact(3)];
    const runs = new Map([ ["1:1", run(1)], ["2:1", run(2, { conclusion: "failure" })], ["3:1", run(3)] ]);
    assert.deepEqual(retention.planRetention(rows, runs, 3, 3, 1, true), { keepIds: [3, 1], deleteIds: [2] });
  });
  it("never deletes a matching name created by another workflow, repo, branch or trigger", () => {
    for (const patch of [ { path: ".github/workflows/other.yml" }, { head_branch: "feature" },
      { repository: { full_name: "other/repo" } }, { event: "pull_request" }, { run_attempt: 2 } ]) {
      const rows = [artifact(1), artifact(2), artifact(3)];
      const runs = new Map([ ["1:1", run(1, patch)], ["2:1", run(2)], ["3:1", run(3)] ]);
      assert.deepEqual(retention.planRetention(rows, runs, 3, 3, 1, true).deleteIds, []);
    }
  });
  it("rejects wrong replacement identity, oversized artifacts and missing provenance", () => {
    const rows = [artifact(1)];
    const runs = new Map([["1:1", run(1)]]);
    assert.throws(() => retention.planRetention(rows, runs, 1, 2, 1, true), /identity/);
    assert.throws(() => retention.planRetention(rows, runs, 1, 1, 2, true), /identity/);
    assert.throws(() => retention.planRetention(rows, new Map(), 1, 1, 1, true), /identity/);
    assert.throws(() => retention.planRetention([artifact(1, 1, 1, { size_in_bytes: 151 * retention.MIB })], runs, 1, 1, 1, true), /identity/);
  });
  it("does not confuse current attempt with a previous rerun artifact", () => {
    const rows = [artifact(1, 10, 1), artifact(2, 10, 2)];
    const runs = new Map([["10:1", run(10)], ["10:2", run(10, { run_attempt: 2 })]]);
    assert.deepEqual(retention.planRetention(rows, runs, 2, 10, 2, true), { keepIds: [2, 1], deleteIds: [] });
  });
});

describe("cloud backup workflow safety wiring", () => {
  const source = readFileSync(".github/workflows/cloud-backup.yml", "utf8");
  it("uses only SHA-pinned actions, standard runner and bounded execution", () => {
    const actions = [...source.matchAll(/uses: (\S+)/g)].map((match) => match[1]);
    assert.equal(actions.length, 4);
    for (const action of actions) assert.match(action, /^actions\/[a-z-]+@[0-9a-f]{40}$/);
    assert.match(source, /runs-on: ubuntu-24\.04/);
    assert.match(source, /timeout-minutes: 10/);
    assert.match(source, /package-manager-cache: false/);
    assert.doesNotMatch(source, /pull_request:|pull_request_target:|self-hosted|cache: npm/);
  });
  it("requires the opt-in variable for schedule and always downloads before verification and pruning", () => {
    assert.match(source, /github\.event\.repository\.private == true/);
    assert.match(source, /vars\.CLOUD_BACKUPS_ENABLED == 'true'/);
    assert.match(source, /cancel-in-progress: false/);
    assert.ok(source.indexOf("uses: actions/download-artifact") < source.indexOf("cloud-backup.mjs verify"));
    assert.ok(source.indexOf("cloud-backup.mjs verify") < source.indexOf("cloud-backup-retention.mjs prune"));
    assert.match(source, /steps\.verify\.outcome != 'success'/);
  });
  it("uploads only encrypted output and restores only to disposable loopback PostgreSQL 18", () => {
    assert.match(source, /path: \$\{\{ runner\.temp \}\}\/betamods-backup-upload\/snapshot\.bmbak/);
    assert.match(source, /127\.0\.0\.1:54329:54329/);
    assert.match(source, /POSTGRES_DB=betamods_restore_rehearsal/);
    assert.match(source, /postgres:18 postgres -p 54329/);
    assert.match(source, /retention-days: 90/);
    assert.doesNotMatch(source, /continue-on-error/);
  });
  it("streams PostgreSQL tool input/output without mounted plaintext or passwords in argv", () => {
    const wrapper = readFileSync("scripts/cloud-backup-pg-client.sh", "utf8");
    assert.match(wrapper, /exec docker exec -i/);
    assert.match(wrapper, /-e PGPASSWORD/);
    assert.match(wrapper, /-e PGCONNECT_TIMEOUT -e PGAPPNAME/);
    assert.match(wrapper, /betamods-backup-rehearsal "\$client" "\$@"/);
    assert.doesNotMatch(wrapper, /--mount|--volume|--tty|--password=|PGPASSWORD=/);
  });
});
