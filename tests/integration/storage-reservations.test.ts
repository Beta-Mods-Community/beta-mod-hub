import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { readDevEnvironment } from "../../scripts/dev-database.mjs";

/**
 * The storage ledger, against a real Postgres.
 *
 * Exercises advisory locks and transaction behavior with concurrent
 * reservations, which cannot be checked by the pure pilot-policy unit tests.
 *
 * Runs against whatever DATABASE_URL is in .env.local, and refuses to run if
 * that turns out to be the production endpoint from .env.production. It writes
 * and deletes rows.
 */

const root = path.join(import.meta.dirname, "..", "..");

let DATABASE_URL = "";
let safe = false;
try {
  DATABASE_URL = readDevEnvironment(root).DATABASE_URL;
  safe = true;
} catch { /* Missing or deployment configuration never writes fixtures. */ }
const describeDb = safe ? describe : describe.skip;

// Everything is pulled in inside before() rather than at the top level: the
// modules read DATABASE_URL when they are first evaluated, and this project is
// CommonJS by default so top-level await cannot be transformed.
type Db = typeof import("../../lib/db");
type Schema = typeof import("../../db/schema");
type Ledger = typeof import("../../lib/storage-usage");
type Pilot = typeof import("../../lib/pilot");

let closeClient: Db["client"] = null;
let db: Db["db"] = null;
let schema: Schema;
let ledger: Ledger;
let pilot: Pilot;

const createdModIds: string[] = [];
const createdUserIds: string[] = [];

/**
 * Bytes already committed in the shared dev database when the suite starts.
 *
 * The global cap counts stored + held across EVERY user, and this is not a
 * dedicated database — a prior e2e run leaves a real stored reservation behind.
 * So the tests below set a cap RELATIVE to this baseline, which keeps their
 * arithmetic ("two 1000-byte uploads fit in 2500") intact while not caring what
 * else is in the ledger. Asserting against held-only totals is not enough: the
 * cap itself has to line up too.
 */
let ambientBytes = 0;

/** Small numbers so the arithmetic in each test is obvious. */
function limits(overrides: Partial<Pilot["PILOT_DEFAULTS"]> = {}): Pilot["PILOT_DEFAULTS"] {
  const base = {
    ...pilot.PILOT_DEFAULTS,
    mode: "on" as const,
    maxArchiveBytes: 1000,
    maxBytesPerTester: 1_000_000,
    maxTotalBytes: 1_000_000,
    uploadsPerWindow: 1000,
    windowMinutes: 60,
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    // The budget this test plays with, on top of whatever was already
    // committed — so the free space is exactly what the test asked for.
    maxTotalBytes: merged.maxTotalBytes + ambientBytes,
  };
}

async function makeUser(label: string): Promise<string> {
  const [row] = await db!
    .insert(schema.users)
    .values({
      email: `pilot-test-${label}-${Math.random().toString(36).slice(2)}@betamods.test`,
      displayName: `pilot-test-${label}`,
    })
    .returning({ id: schema.users.id });
  createdUserIds.push(row.id);
  return row.id;
}

async function makeMod(ownerId: string, title: string): Promise<string> {
  const [row] = await db!
    .insert(schema.betaMods)
    .values({ ownerId, title, game: "pilot-test" })
    .returning({ id: schema.betaMods.id });
  createdModIds.push(row.id);
  return row.id;
}

async function heldBytes(userId?: string): Promise<number> {
  const rows = await db!
    .select({ bytes: schema.storageReservations.bytes })
    .from(schema.storageReservations)
    .where(
      userId
        ? and(
            eq(schema.storageReservations.state, "held"),
            eq(schema.storageReservations.userId, userId),
          )
        : eq(schema.storageReservations.state, "held"),
    );
  return rows.reduce((total, row) => total + Number(row.bytes), 0);
}

describeDb("storage ledger (integration)", () => {
  before(async () => {
    if (!safe) return;
    // Set before the modules are evaluated: lib/db.ts reads the environment
    // once, when it is first imported.
    process.env.DATABASE_URL = DATABASE_URL;
    const dbModule: Db = await import("../../lib/db");
    pilot = await import("../../lib/pilot");
    schema = await import("../../db/schema");
    ledger = await import("../../lib/storage-usage");
    closeClient = dbModule.client;
    db = dbModule.db;
    if (!db) throw new Error("DATABASE_URL is set but lib/db.ts produced no client");

    // Baseline the caps against whatever the shared dev ledger already holds.
    const usage = await ledger.getStorageUsage();
    if (!usage) throw new Error("could not read storage usage to set the test baseline");
    // totalBytes is stored + held, which is exactly what the cap is measured
    // against. No test reservations exist yet, so this is the ambient total.
    ambientBytes = usage.totalBytes;
  });

  after(async () => {
    // Deleting the users and mods cascades to everything this file created.
    for (const id of createdModIds) {
      await db!.delete(schema.betaMods).where(eq(schema.betaMods.id, id));
    }
    for (const id of createdUserIds) {
      await db!.delete(schema.users).where(eq(schema.users.id, id));
    }
    await closeClient?.end();
  });

  it("reserves bytes, then releases them so the budget comes back", async () => {
    const opts = limits({ maxTotalBytes: 1000 });
    const userId = await makeUser("release");

    const first = await ledger.reserveStorage({ userId, bytes: 1000, limits: opts });
    assert.equal(first.ok, true);
    assert.equal(await heldBytes(), 1000, "a held reservation counts");

    // A second tester is refused while the budget is committed...
    const other = await makeUser("release-other");
    const blocked = await ledger.reserveStorage({
      userId: other,
      bytes: 1,
      limits: opts,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.reason, "global-cap");

    // ...and gets it back once the reservation is released.
    if (first.ok) await ledger.releaseReservation(first.reservationId);
    assert.equal(await heldBytes(), 0, "a released reservation does not count");

    const afterRelease = await ledger.reserveStorage({
      userId: other,
      bytes: 1000,
      limits: opts,
    });
    assert.equal(afterRelease.ok, true);
    if (afterRelease.ok) await ledger.releaseReservation(afterRelease.reservationId);
  });

  it("never writes a row for a refused reservation", async () => {
    // A rejection must not reserve bytes, and must not read as an attempt that
    // then counts against the rate limit.
    const userId = await makeUser("refused");
    const result = await ledger.reserveStorage({
      userId,
      bytes: 5000,
      limits: limits({ maxArchiveBytes: 1000, uploadsPerWindow: 1 }),
    });
    assert.equal(result.ok, false);

    const rows = await db!
      .select({ id: schema.storageReservations.id })
      .from(schema.storageReservations)
      .where(eq(schema.storageReservations.userId, userId));
    assert.equal(rows.length, 0);
  });

  it("refuses to reserve a nonsensical size", async () => {
    const userId = await makeUser("zero");
    for (const bytes of [0, -5, 1.5]) {
      const result = await ledger.reserveStorage({ userId, bytes, limits: limits() });
      assert.equal(result.ok, false, `bytes=${bytes}`);
    }
  });

  it("enforces the global cap under genuine concurrency", async () => {
    // Ten 1000-byte uploads race for 2500 bytes of FREE space (see limits()).
    // Without the advisory lock every one of them reads the same free space and
    // every one proceeds. Exactly two must win, and the ledger must never
    // exceed the cap.
    const contenders = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makeUser(`race-${i}`)),
    );
    const opts = limits({ maxTotalBytes: 2500, maxBytesPerTester: 10_000 });

    const results = await Promise.all(
      contenders.map((userId) =>
        ledger.reserveStorage({ userId, bytes: 1000, limits: opts }),
      ),
    );

    const winners = results.filter((result) => result.ok);
    assert.equal(winners.length, 2, "exactly two 1000-byte uploads fit in 2500");
    assert.equal(await heldBytes(), 2000, "the cap was never exceeded");
    for (const result of results) {
      if (!result.ok) assert.equal(result.reason, "global-cap");
    }
    for (const winner of winners) {
      if (winner.ok) await ledger.releaseReservation(winner.reservationId);
    }
    assert.equal(await heldBytes(), 0);
  });

  it("enforces the per-tester cap under genuine concurrency", async () => {
    // One account racing itself: five 1000-byte uploads against 2500 -> two win.
    const userId = await makeUser("self-race");
    const opts = limits({
      maxTotalBytes: 10_000,
      maxBytesPerTester: 2500,
      uploadsPerWindow: 1000,
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ledger.reserveStorage({ userId, bytes: 1000, limits: opts }),
      ),
    );

    const winners = results.filter((result) => result.ok);
    assert.equal(winners.length, 2);
    assert.equal(await heldBytes(userId), 2000);
    for (const winner of winners) {
      if (winner.ok) await ledger.releaseReservation(winner.reservationId);
    }
    assert.equal(await heldBytes(userId), 0);
  });

  it("rate limits repeated attempts, released or not", async () => {
    const userId = await makeUser("rate");
    const opts = limits({
      uploadsPerWindow: 2,
      maxTotalBytes: 1_000_000,
      maxBytesPerTester: 1_000_000,
    });

    const first = await ledger.reserveStorage({ userId, bytes: 10, limits: opts });
    assert.equal(first.ok, true);
    if (first.ok) await ledger.releaseReservation(first.reservationId);

    const second = await ledger.reserveStorage({ userId, bytes: 10, limits: opts });
    assert.equal(second.ok, true);
    if (second.ok) await ledger.releaseReservation(second.reservationId);

    // Both attempts are inside the window now, even though both were released —
    // a client hammering the endpoint still gets stopped.
    const third = await ledger.reserveStorage({ userId, bytes: 10, limits: opts });
    assert.equal(third.ok, false);
    if (!third.ok) assert.equal(third.reason, "rate-limited");
  });

  it("keeps old stored files charged but excludes their old attempts from the rate window", async () => {
    const userId = await makeUser("old-stored");
    const [stored] = await db!.insert(schema.storageReservations).values({
      userId, bytes: 900, state: "stored",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      settledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    }).returning({ id: schema.storageReservations.id });
    try {
      const opts = limits({ maxBytesPerTester: 1000, uploadsPerWindow: 1 });
      const tooLarge = await ledger.reserveStorage({ userId, bytes: 101, limits: opts });
      assert.equal(tooLarge.ok, false);
      if (!tooLarge.ok) assert.equal(tooLarge.reason, "tester-cap");

      const fits = await ledger.reserveStorage({ userId, bytes: 100, limits: opts });
      assert.equal(fits.ok, true, "old stored row must not count as a recent attempt");
      if (fits.ok) await ledger.releaseReservation(fits.reservationId);
      const recent = await ledger.reserveStorage({ userId, bytes: 1, limits: opts });
      assert.equal(recent.ok, false);
      if (!recent.ok) assert.equal(recent.reason, "rate-limited");
    } finally {
      await db!.delete(schema.storageReservations).where(eq(schema.storageReservations.id, stored.id));
    }
  });

  it("settles a reservation against its build and counts it as stored", async () => {
    const userId = await makeUser("settle");
    const modId = await makeMod(userId, "pilot settle");

    const reservation = await ledger.reserveStorage({
      userId,
      bytes: 500,
      limits: limits(),
    });
    assert.equal(reservation.ok, true);
    if (!reservation.ok) return;

    const [build] = await db!
      .insert(schema.builds)
      .values({ betaModId: modId, versionLabel: "0.1", fileUrl: "builds/x.zip" })
      .returning({ id: schema.builds.id });
    await ledger.markReservationStored(reservation.reservationId, build.id);

    assert.equal(await heldBytes(), 0, "stored bytes are no longer in flight");

    const usage = await ledger.getStorageUsage();
    assert.ok(usage, "usage must be readable");
    const mine = usage!.perUser.find((row) => row.userId === userId);
    assert.ok(mine, "the uploader appears in the admin breakdown");
    assert.equal(mine!.storedBytes, 500);
  });

  it("releases stored bytes when the build is deleted", async () => {
    // Deleting a mod cascades to its builds and their reservations, so the
    // budget comes back without anyone having to remember to release it.
    const userId = await makeUser("cascade");
    const modId = await makeMod(userId, "pilot cascade");

    const reservation = await ledger.reserveStorage({
      userId,
      bytes: 400,
      limits: limits(),
    });
    assert.equal(reservation.ok, true);
    if (!reservation.ok) return;

    const [build] = await db!
      .insert(schema.builds)
      .values({ betaModId: modId, versionLabel: "0.1", fileUrl: "builds/y.zip" })
      .returning({ id: schema.builds.id });
    await ledger.markReservationStored(reservation.reservationId, build.id);

    const before = await ledger.getStorageUsage();
    assert.equal(before!.perUser.find((r) => r.userId === userId)?.storedBytes, 400);

    await db!.delete(schema.betaMods).where(eq(schema.betaMods.id, modId));

    const afterUsage = await ledger.getStorageUsage();
    assert.equal(
      afterUsage!.perUser.find((r) => r.userId === userId)?.storedBytes ?? 0,
      0,
      "deleting the mod released its stored bytes",
    );
  });

  it("keeps aged held bytes charged until explicit verified release", async () => {
    // A dead request may have completed a remote PUT before losing its process.
    // Age cannot distinguish that from an upload which never reached storage.
    const userId = await makeUser("stale");
    const otherUserId = await makeUser("stale-other");
    const beforeUsage = await ledger.getStorageUsage();
    assert.ok(beforeUsage);
    const opts = limits({ maxBytesPerTester: 1000, uploadsPerWindow: 1, reservationTtlMinutes: 1 });
    // Earlier cases may have settled their own fixtures: include those too,
    // so only the aged hold can consume this test's exact 1000-byte budget.
    opts.maxTotalBytes = beforeUsage.totalBytes + 1000;

    const [row] = await db!
      .insert(schema.storageReservations)
      .values({
        userId,
        bytes: 1000,
        state: "held",
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.storageReservations.id });
    try {
      assert.equal(await heldBytes(userId), 1000);
      const globalBlocked = await ledger.reserveStorage({ userId: otherUserId, bytes: 1, limits: opts });
      assert.equal(globalBlocked.ok, false, "old held bytes still consume the global cap");
      if (!globalBlocked.ok) assert.equal(globalBlocked.reason, "global-cap");
      const ownerBlocked = await ledger.reserveStorage({ userId, bytes: 1, limits: opts });
      assert.equal(ownerBlocked.ok, false, "old held bytes still consume the owner's cap");
      if (!ownerBlocked.ok) assert.equal(ownerBlocked.reason, "tester-cap");

      const [retained] = await db!.select().from(schema.storageReservations)
        .where(eq(schema.storageReservations.id, row.id));
      assert.equal(retained?.state, "held");
      assert.equal(retained?.bytes, 1000);
      assert.equal((await ledger.getStorageUsage())?.totalBytes, beforeUsage.totalBytes + 1000);

      // This fixture never writes an object, so its absence is known. A real
      // interrupted upload needs a storage/DB reconciliation before this call.
      await ledger.releaseReservation(row.id);
      assert.equal(await heldBytes(userId), 0);
      const afterRelease = await ledger.reserveStorage({ userId, bytes: 1000, limits: opts });
      assert.equal(afterRelease.ok, true, "explicit safe release restores the full capacity");
      if (afterRelease.ok) await ledger.releaseReservation(afterRelease.reservationId);
    } finally {
      // Only this known object-free fixture is released, even after failure.
      await ledger.releaseReservation(row.id);
    }
  });

  it("treats the allowlist as closed until an account is approved", async () => {
    const userId = await makeUser("allowlist");
    const opts = limits();

    const before = await ledger.getUploadPermission(userId, opts);
    assert.equal(before.allowed, false, "pilot mode starts closed");

    // A delta, not an absolute count: this is a shared dev database, and the
    // e2e run leaves the demo owner on the allowlist. The property under test
    // is "approving adds exactly one account", not "the table has one row".
    const baseline = await ledger.countPilotAccounts();

    await db!
      .insert(schema.pilotAccounts)
      .values({ userId, approvedBy: "test" });

    const after = await ledger.getUploadPermission(userId, opts);
    assert.equal(after.allowed, true);
    assert.equal(await ledger.countPilotAccounts(), baseline + 1);
  });

  it("lets the admin kill switch pause and resume uploads", async () => {
    const userId = await makeUser("switch");
    const opts = limits({ mode: "off" });

    const wasEnabled = await ledger.isUploadsEnabled();
    try {
      await ledger.setUploadsEnabled(false);
      const paused = await ledger.getUploadPermission(userId, opts);
      assert.equal(paused.allowed, false, "the switch wins over pilot mode");

      await ledger.setUploadsEnabled(true);
      const resumed = await ledger.getUploadPermission(userId, opts);
      assert.equal(resumed.allowed, true);
    } finally {
      await ledger.setUploadsEnabled(wasEnabled);
    }
  });
});
