import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { contentReports } from "../db/community-schema";
import { pilotAccounts, users } from "../db/schema";

type DatabaseModule = typeof import("../lib/db");
type Database = NonNullable<DatabaseModule["db"]>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Row = Record<string, unknown>;
const dialect = new PgDialect();

// Query adapter for offline service checks. Resolves the service's actual SQL
// predicates and records row locks; no SQL ever reaches a database connection.
function query(read: (table: unknown, condition?: SQL) => Row[] | Promise<Row[]>, onLock: (mode: string) => void = () => {}) {
  let table: unknown;
  let condition: SQL | undefined;
  const chain = {
    from(value: unknown) { table = value; return chain; },
    where(value: SQL) { condition = value; return chain; },
    limit() { return chain; },
    for(mode: string) { onLock(mode); return chain; },
    then(resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) {
      return Promise.resolve().then(() => read(table, condition)).then(resolve, reject);
    },
  };
  return chain;
}

let databaseModule: DatabaseModule;
let database: Database;
let approvals: typeof import("../lib/pilot-approvals");
let moderation: typeof import("../lib/moderation-service");
let community: typeof import("../lib/community-service");
let access: typeof import("../lib/account-write-access");
const savedEnvironment = {
  DATABASE_URL: process.env.DATABASE_URL,
  ADMIN_USER_IDS: process.env.ADMIN_USER_IDS,
  AUTH_ALLOW_UNVERIFIED_LOCAL: process.env.AUTH_ALLOW_UNVERIFIED_LOCAL,
};
const adminId = randomUUID();

describe("account write boundaries (offline)", () => {
  before(async () => {
    // A lazy client exists only so the service entry points can be intercepted.
    // Port 1 is deliberately unusable, and every database method used is mocked.
    process.env.DATABASE_URL = "postgres://unit:unit@127.0.0.1:1/unit";
    process.env.ADMIN_USER_IDS = adminId;
    process.env.AUTH_ALLOW_UNVERIFIED_LOCAL = "false";
    databaseModule = await import("../lib/db");
    database = databaseModule.db!;
    approvals = await import("../lib/pilot-approvals");
    moderation = await import("../lib/moderation-service");
    community = await import("../lib/community-service");
    access = await import("../lib/account-write-access");
  });
  after(async () => {
    await databaseModule.client?.end();
    for (const [key, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  function approvalStore(accounts: { id: string; email: string; displayName: string }[]) {
    const approved = new Set<string>();
    let pendingLock = Promise.resolve();
    const transaction = async (work: (tx: Transaction) => Promise<unknown>) => {
      let locked = false;
      let release: (() => void) | undefined;
      const tx = {
        async execute(statement: SQL) {
          const compiled = dialect.sqlToQuery(statement);
          assert.match(compiled.sql, /pg_advisory_xact_lock/);
          assert.match(compiled.sql, /pilot-account-approvals/);
          const previous = pendingLock;
          pendingLock = new Promise<void>(resolve => { release = resolve; });
          await previous;
          locked = true;
          return [];
        },
        select() {
          return query((table, condition) => {
            assert.ok(locked, "The cap and existing approval must be read inside the shared approval lock");
            const params = condition ? dialect.sqlToQuery(condition).params : [];
            if (table === users) return accounts.filter(account => account.email.toLowerCase() === params[0]);
            if (table === pilotAccounts && !condition) return [{ count: approved.size }];
            if (table === pilotAccounts) return approved.has(String(params[0])) ? [{ userId: params[0] }] : [];
            throw new Error("Unexpected approval table");
          });
        },
        insert(table: unknown) {
          assert.equal(table, pilotAccounts);
          return { async values(row: { userId: string }) {
            await new Promise(resolve => setImmediate(resolve));
            assert.ok(!approved.has(row.userId), "Duplicate approval would violate the database unique constraint");
            approved.add(row.userId);
          } };
        },
      } as unknown as Transaction;
      try { return await work(tx); } finally { release?.(); }
    };
    return { approved, transaction: transaction as Database["transaction"] };
  }

  it("serializes concurrent approval grants so the configured cap cannot be exceeded", async t => {
    const accounts = Array.from({ length: 6 }, (_, index) => ({ id: randomUUID(), email: `tester${index}@example.test`, displayName: `Tester ${index}` }));
    const store = approvalStore(accounts);
    t.mock.method(database, "transaction", store.transaction);
    const results = await Promise.all(accounts.map(account => approvals.approvePilotUploader({
      email: account.email, note: null, approvedBy: adminId, maxApproved: 2,
    })));
    assert.equal(results.filter(result => result.outcome === "approved").length, 2);
    assert.equal(results.filter(result => result.outcome === "full").length, 4);
    assert.equal(store.approved.size, 2);
  });

  it("deduplicates concurrent approvals and matches legacy mixed-case account emails", async t => {
    const account = { id: randomUUID(), email: "Legacy@Example.test", displayName: "Legacy" };
    const store = approvalStore([account]);
    t.mock.method(database, "transaction", store.transaction);
    const results = await Promise.all(Array.from({ length: 5 }, () => approvals.approvePilotUploader({
      email: account.email.toLowerCase(), note: null, approvedBy: adminId, maxApproved: 2,
    })));
    assert.equal(results.filter(result => result.outcome === "approved").length, 1);
    assert.equal(results.filter(result => result.outcome === "existing").length, 4);
    assert.equal(store.approved.size, 1);
  });

  it("does not report success or create moderation audit records for nonexistent targets", async t => {
    const tx = {
      select: () => query(() => []),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
      insert: () => { throw new Error("A nonexistent target must not create an audit record"); },
    } as unknown as Transaction;
    t.mock.method(database, "transaction", (async work => work(tx)) as Database["transaction"]);
    assert.equal(await moderation.applyModeration(adminId, randomUUID(), "hide", "No matching listing"), false);
    assert.equal(await moderation.setAccountSuspendedRecord(adminId, randomUUID(), true, "No matching account"), false);
  });

  it("reports duplicate content reports as an unchanged existing report", async t => {
    const modId = randomUUID();
    t.mock.method(database, "select", (() => query(() => [{ id: modId }])) as unknown as Database["select"]);
    t.mock.method(database, "insert", ((table: unknown) => {
      assert.equal(table, contentReports);
      return { values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) };
    }) as unknown as Database["insert"]);
    const result = await community.reportContentRecord(randomUUID(), modId, "The same content issue is still visible.");
    assert.match(result, /already reported/);
    assert.match(result, /No new report/);
  });

  it("holds a shared account row lock when checking a final publication transaction", async () => {
    const locks: string[] = [];
    let row: Row = { emailVerifiedAt: new Date(), suspendedAt: null };
    const tx = { select: () => query(() => [row], mode => { locks.push(mode); }) } as unknown as Transaction;
    assert.equal(await access.getAccountWriteError(randomUUID(), tx), null);
    row = { ...row, suspendedAt: new Date() };
    assert.match((await access.getAccountWriteError(randomUUID(), tx))!, /unavailable/);
    row = { emailVerifiedAt: null, suspendedAt: null };
    assert.match((await access.getAccountWriteError(randomUUID(), tx))!, /Verify your email/);
    assert.deepEqual(locks, ["share", "share", "share"]);
  });
});
