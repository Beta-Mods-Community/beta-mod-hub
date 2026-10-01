import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import ts from "typescript";
import { appSettings, pilotAccounts } from "../db/schema";
import { readPilotLimits } from "../lib/pilot";
import type { ModTransaction } from "../lib/mod-lifecycle";

let ledger: typeof import("../lib/storage-usage");
before(async () => {
  // Never construct a real client, even if the shell has inherited credentials.
  const databaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try { ledger = await import("../lib/storage-usage"); }
  finally {
    if (databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrl;
  }
});

const userId = "d147ed45-cd2d-426c-b4aa-00bfe931205a";
const limits = readPilotLimits({ PILOT_MODE: "on" });
const dialect = new PgDialect();

function permissionTransaction(state: { enabled?: string; approved: boolean }, afterLock?: () => void) {
  const calls: string[] = [];
  const tx = {
    async execute(query: SQL) {
      calls.push(dialect.sqlToQuery(query).sql);
      afterLock?.();
    },
    select() {
      return { from(table: unknown) {
        assert.ok(table === appSettings || table === pilotAccounts);
        const name = table === appSettings ? "settings" : "approval";
        const query = {
          where(condition: SQL) {
            const rendered = dialect.sqlToQuery(condition);
            assert.deepEqual(rendered.params, [name === "settings" ? "uploads_enabled" : userId]);
            return query;
          },
          limit() { return query; },
          for(mode: string) { calls.push(`${name} lock ${mode}`); return query; },
          then(resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) {
            calls.push(`${name} read`);
            const rows = name === "settings" ? state.enabled === undefined ? [] : [{ value: state.enabled }]
              : state.approved ? [{ userId }] : [];
            return Promise.resolve(rows).then(resolve, reject);
          },
        };
        return query;
      } };
    },
  } as unknown as ModTransaction;
  return { tx, calls };
}

test("commit permission re-reads after locking and holds approval against revocation", async () => {
  const { tx, calls } = permissionTransaction({ approved: true });
  assert.deepEqual(await ledger.getUploadPermission(userId, limits, tx), { allowed: true });
  assert.deepEqual(calls, [
    "select pg_advisory_xact_lock_shared(hashtext('upload-permission'))",
    "settings read", "approval lock share", "approval read",
  ]);
});

for (const change of ["pause", "revoke"] as const) {
  test(`a ${change} completed while the upload was scanning blocks publication`, async () => {
    const state = { enabled: "true", approved: true };
    const { tx, calls } = permissionTransaction(state, () => {
      if (change === "pause") state.enabled = "false";
      else state.approved = false;
    });
    const result = await ledger.getUploadPermission(userId, limits, tx);
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.match(result.message, change === "pause" ? /paused/ : /approved/);
    if (change === "pause") assert.ok(!calls.includes("approval read"), "pause wins before approval");
  });
}

test("non-pilot uploads still observe pauses without requiring approval", async () => {
  const { tx, calls } = permissionTransaction({ enabled: "true", approved: false });
  assert.deepEqual(await ledger.getUploadPermission(userId, { ...limits, mode: "off" }, tx), { allowed: true });
  assert.ok(!calls.includes("approval read"));
  const paused = permissionTransaction({ enabled: "false", approved: true });
  assert.equal((await ledger.getUploadPermission(userId, { ...limits, mode: "off" }, paused.tx)).allowed, false);
});

test("unknown upload policy never permits a publication", async () => {
  assert.equal((await ledger.getUploadPermission(userId, { ...limits, mode: "off" })).allowed, false);
  const { tx } = permissionTransaction({ approved: true });
  tx.execute = (async () => { throw new Error("lock unavailable"); }) as unknown as ModTransaction["execute"];
  await assert.rejects(ledger.getUploadPermission(userId, limits, tx), /lock unavailable/);
});

function source(name: string) {
  return ts.createSourceFile(name, readFileSync(new URL(`../lib/${name}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
}

function callsWithin(node: ts.Node, method: string): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  function visit(child: ts.Node) {
    if (ts.isCallExpression(child) && (ts.isIdentifier(child.expression) && child.expression.text === method ||
      ts.isPropertyAccessExpression(child.expression) && child.expression.name.text === method)) calls.push(child);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return calls;
}

for (const [file, table] of [["build-uploads.ts", "builds"], ["feedback.ts", "bugReports"], ["media-service.ts", "modMedia"]]) {
  test(`${file} checks account and upload policy inside its final publication transaction`, () => {
    const tree = source(file);
    const transactions = callsWithin(tree, "transaction");
    const commit = transactions.find(call => callsWithin(call, "insert").some(insert => insert.arguments[0]?.getText(tree) === table));
    assert.ok(commit, "Expected publication transaction");
    const insert = callsWithin(commit, "insert").find(call => call.arguments[0]?.getText(tree) === table)!;
    const lock = callsWithin(commit, "lockModForMutation")[0];
    const account = callsWithin(commit, "getAccountWriteError")[0];
    const permission = callsWithin(commit, "getUploadPermission")[0];
    assert.ok(lock && account && permission, "Commit must revalidate all three policy layers");
    assert.equal(account.arguments.at(-1)?.getText(tree), "tx");
    assert.equal(permission.arguments.at(-1)?.getText(tree), "tx");
    assert.ok(ts.isAwaitExpression(account.parent) && ts.isAwaitExpression(permission.parent));
    assert.ok(lock.pos < account.pos && account.pos < permission.pos && permission.pos < insert.pos);
    if (file === "feedback.ts") {
      let parent: ts.Node | undefined = permission.parent;
      while (parent && !ts.isIfStatement(parent) && parent !== commit) parent = parent.parent;
      assert.ok(parent && ts.isIfStatement(parent));
      assert.equal(parent.expression.getText(tree), "file", "Text-only reports do not require upload approval");
    }
  });
}

test("pausing uploads takes the matching exclusive transaction lock before changing the setting", () => {
  const tree = source("storage-usage.ts");
  const setter = tree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "setUploadsEnabled");
  assert.ok(setter);
  const transaction = callsWithin(setter, "transaction")[0];
  assert.ok(transaction);
  const lock = callsWithin(transaction, "execute")[0];
  const insert = callsWithin(transaction, "insert")[0];
  assert.ok(lock && insert && lock.pos < insert.pos);
  assert.equal(lock.arguments[0].getText(tree), "sql`select pg_advisory_xact_lock(hashtext('upload-permission'))`");
  assert.ok(ts.isAwaitExpression(lock.parent));
});
