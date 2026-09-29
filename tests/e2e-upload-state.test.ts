import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

type Module = typeof import("../scripts/e2e-upload-state.mjs");
let state: Module;
before(async () => { state = await import("../scripts/e2e-upload-state.mjs"); });

type Row = Record<string, unknown>;
type Call = { query: string; values: unknown[] };
function databaseMock(switchRow: Row | null, approvalRow: Row | null, failApprovalWrite = false) {
  const calls: Call[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> => {
    const query = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ query, values });
    if (query.startsWith("select") && query.includes("from app_settings")) return switchRow ? [switchRow] : [];
    if (query.startsWith("select") && query.includes("from pilot_accounts")) return approvalRow ? [approvalRow] : [];
    if (failApprovalWrite && query.startsWith("insert into pilot_accounts")) throw new Error("simulated approval restore failure");
    return [];
  };
  return { sql, calls };
}

const originalSwitch = { key: "uploads_enabled", value: "false", updated_at: "2026-09-29 10:00:00.123456+00" };
const originalApproval = {
  id: "approval-original", user_id: "fixture-owner", approved_by: "administrator",
  note: "Original approval note", approved_at: "2026-09-01 10:00:00.123456+00",
};

describe("upload e2e control restoration (mock database only)", () => {
  it("snapshots the switch even with pilot mode off, without reading or changing approvals", async () => {
    const db = databaseMock(originalSwitch, originalApproval);
    const snapshot = await state.captureUploadTestState(db.sql, "fixture-owner", false);
    assert.deepEqual(snapshot.uploadsEnabled, originalSwitch);
    assert.equal(snapshot.approval, null);
    assert.equal(db.calls.length, 1);
    await state.restoreUploadTestState(db.sql, snapshot);
    assert.equal(db.calls.length, 2);
    assert.match(db.calls[1].query, /^insert into app_settings/);
    assert.deepEqual(db.calls[1].values, ["false", originalSwitch.updated_at]);
  });

  it("restores an originally absent switch by deleting the test row", async () => {
    const db = databaseMock(null, null);
    const snapshot = await state.captureUploadTestState(db.sql, "fixture-owner", false);
    assert.equal(snapshot.uploadsEnabled, null);
    await state.restoreUploadTestState(db.sql, snapshot);
    assert.match(db.calls.at(-1)!.query, /^delete from app_settings where key = 'uploads_enabled'$/);
    assert.equal(db.calls.some(call => call.query.includes("pilot_accounts")), false);
  });

  it("preserves the complete prior approval and timestamp precision", async () => {
    const db = databaseMock(originalSwitch, originalApproval);
    const snapshot = await state.captureUploadTestState(db.sql, "fixture-owner", true);
    assert.deepEqual(snapshot.approval, originalApproval);
    assert.match(db.calls[0].query, /updated_at::text/);
    assert.match(db.calls[1].query, /approved_at::text/);
    await state.restoreUploadTestState(db.sql, snapshot);
    const restored = db.calls.find(call => call.query.startsWith("insert into pilot_accounts"))!;
    assert.deepEqual(restored.values, Object.values(originalApproval));
    assert.match(restored.query, /id = excluded.id/);
    assert.match(restored.query, /approved_by = excluded.approved_by/);
    assert.match(restored.query, /note = excluded.note/);
    assert.match(restored.query, /approved_at = excluded.approved_at/);
  });

  it("removes test approval if the fixture was originally unapproved", async () => {
    const db = databaseMock(originalSwitch, null);
    const snapshot = await state.captureUploadTestState(db.sql, "fixture-owner", true);
    await state.restoreUploadTestState(db.sql, snapshot);
    const deleted = db.calls.find(call => call.query.startsWith("delete from pilot_accounts"))!;
    assert.deepEqual(deleted.values, ["fixture-owner"]);
    assert.match(db.calls.at(-1)!.query, /^insert into app_settings/);
  });

  it("restores a paused switch in finally after a simulated test exception", async () => {
    const db = databaseMock(originalSwitch, null);
    const snapshot = await state.captureUploadTestState(db.sql, "fixture-owner", false);
    await assert.rejects(async () => {
      try { throw new Error("test failed midway"); }
      finally { await state.restoreUploadTestState(db.sql, snapshot); }
    }, /test failed midway/);
    assert.deepEqual(db.calls.at(-1)!.values, ["false", originalSwitch.updated_at]);
  });

  it("attempts switch restoration even if approval restoration fails, then fails loudly", async () => {
    const db = databaseMock(originalSwitch, originalApproval, true);
    const snapshot = await state.captureUploadTestState(db.sql, "fixture-owner", true);
    await assert.rejects(state.restoreUploadTestState(db.sql, snapshot), /pilot approval restoration failed/);
    assert.match(db.calls.at(-1)!.query, /^insert into app_settings/);
    assert.deepEqual(db.calls.at(-1)!.values, ["false", originalSwitch.updated_at]);
  });

  it("reports the four driver/pilot combinations without calling skipped coverage passed", () => {
    assert.equal(state.expectedUploadCheckCount("r2", true), 29);
    assert.equal(state.expectedUploadCheckCount("r2", false), 23);
    assert.equal(state.expectedUploadCheckCount("local", true), 25);
    assert.equal(state.expectedUploadCheckCount("local", false), 19);
    assert.throws(() => state.expectedUploadCheckCount("typo", true), /local or r2/);
  });
});
