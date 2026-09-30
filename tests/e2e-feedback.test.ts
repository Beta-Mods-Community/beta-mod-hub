import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import { runInNewContext } from "node:vm";

let state: typeof import("../scripts/e2e-upload-state.mjs");
before(async () => { state = await import("../scripts/e2e-upload-state.mjs"); });

// Execute the real initialization block with inert dependencies. Never import
// the destructive entry point or read private configuration during unit tests.
const source = readFileSync(new URL("../scripts/e2e-feedback.mjs", import.meta.url), "utf8");
const start = source.indexOf("const env = readDevEnvironment(root);");
const end = source.indexOf("const base =", start);
assert.ok(start >= 0 && end > start, "Feedback initialization block is present");
const initialize = source.slice(start, end);

function rehearsal(storageDriver?: string, override?: string) {
  const databaseCalls: unknown[] = [];
  return {
    databaseCalls,
    run: () => runInNewContext(initialize, {
      root: "unused-fixture-root",
      process: { env: { E2E_STORAGE_DRIVER: override } },
      readDevEnvironment: () => ({
        DATABASE_URL: "postgresql://fixture:unused@dev.example.test/app",
        SESSION_SECRET: "fixture-only",
        STORAGE_DRIVER: storageDriver,
      }),
      assertE2eStorageDriver: state.assertE2eStorageDriver,
      postgres: (...args: unknown[]) => { databaseCalls.push(args); return {}; },
    }),
  };
}

test("feedback rehearsal rejects unsupported configured or override drivers before creating a database client", () => {
  for (const driver of ["s3", "typo", "R2", " local "]) {
    for (const fixture of [rehearsal(driver), rehearsal("local", driver)]) {
      assert.throws(fixture.run, /Expected storage driver local or r2/);
      assert.equal(fixture.databaseCalls.length, 0);
    }
  }
});

test("feedback rehearsal preserves local default, R2 support, and explicit supported overrides", () => {
  for (const fixture of [rehearsal(), rehearsal("local"), rehearsal("r2"), rehearsal("local", "r2")]) {
    assert.doesNotThrow(fixture.run);
    assert.equal(fixture.databaseCalls.length, 1);
  }
});
