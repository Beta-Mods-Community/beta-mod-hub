import assert from "node:assert/strict";
import { before, after, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

const root = path.join(import.meta.dirname, "..", "..");
function envUrl(file: string) {
  try { return readFileSync(path.join(root, file), "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? ""; }
  catch { return ""; }
}
const devUrl = envUrl(".env.local");
const prodUrl = envUrl(".env.production");
function endpoint(value: string) { try { const url = new URL(value); return url.hostname.replace("-pooler", "") + url.pathname; } catch { return ""; } }
const safeDev = !!devUrl && !!prodUrl && endpoint(devUrl) !== endpoint(prodUrl);
const describeDb = safeDev ? describe : describe.skip;
let db: NonNullable<typeof import("../../lib/db")["db"]>;
let client: NonNullable<typeof import("../../lib/db")["client"]>;
let schema: typeof import("../../db/schema");
let lifecycle: typeof import("../../lib/mod-lifecycle");
let feedback: typeof import("../../lib/feedback-write");
const modIds: string[] = [];
const userIds: string[] = [];

async function fixture() {
  const ownerId = randomUUID(), testerId = randomUUID(), modId = randomUUID(), buildId = randomUUID();
  await db.insert(schema.users).values([{ id: ownerId, displayName: "workflow test owner" }, { id: testerId, displayName: "workflow test tester" }]);
  userIds.push(ownerId, testerId);
  await db.insert(schema.betaMods).values({ id: modId, ownerId, title: "workflow test fixture", game: "Test", status: "abandoned" });
  modIds.push(modId);
  // Mutations need active status; remove these short-lived fixtures in after().
  await db.update(schema.betaMods).set({ status: "beta" }).where(eq(schema.betaMods.id, modId));
  await db.insert(schema.builds).values({ id: buildId, betaModId: modId, versionLabel: "test-1", fileUrl: `tests/${buildId}`, uploadedAt: new Date(Date.now() - 60000) });
  return { ownerId, testerId, modId, buildId };
}

describeDb("feedback workflow on dev Postgres", () => {
  before(async () => {
    process.env.DATABASE_URL = devUrl;
    const databaseModule = await import("../../lib/db");
    db = databaseModule.db!; client = databaseModule.client!;
    schema = await import("../../db/schema");
    lifecycle = await import("../../lib/mod-lifecycle");
    feedback = await import("../../lib/feedback-write");
  });
  after(async () => {
    if (db && modIds.length) await db.delete(schema.betaMods).where(inArray(schema.betaMods.id, modIds));
    if (db && userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    if (client) await client.end();
  });
  it("records the current displayed build, updates it once, and refuses a stale replacement", async () => {
    const f = await fixture();
    const input = { betaModId: f.modId, displayedBuildId: f.buildId, testerId: f.testerId, isReady: true };
    await db.transaction(tx => feedback.recordBuildVote(tx, input));
    await db.transaction(tx => feedback.recordBuildVote(tx, { ...input, isReady: false }));
    const nextId = randomUUID();
    await db.insert(schema.builds).values({ id: nextId, betaModId: f.modId, versionLabel: "test-2", fileUrl: `tests/${nextId}` });
    await assert.rejects(db.transaction(tx => feedback.recordBuildVote(tx, input)), /vote was not saved/);
    const votes = await db.select().from(schema.readySignals).where(eq(schema.readySignals.betaModId, f.modId));
    assert.equal(votes.length, 1);
    assert.equal(votes[0].buildId, f.buildId);
    assert.equal(votes[0].isReady, false);
  });
  it("blocks a forged cross-mod build and the author's own vote", async () => {
    const f = await fixture();
    await assert.rejects(db.transaction(tx => feedback.recordBuildVote(tx, { betaModId: f.modId, displayedBuildId: randomUUID(), testerId: f.testerId, isReady: true })), /vote was not saved/);
    await assert.rejects(db.transaction(tx => feedback.recordBuildVote(tx, { betaModId: f.modId, displayedBuildId: f.buildId, testerId: f.ownerId, isReady: true })), /own mods/);
  });
  it("a promotion in flight wins before a waiting feedback mutation", async () => {
    const f = await fixture();
    let locked!: () => void, release!: () => void;
    const lockReady = new Promise<void>(resolve => { locked = resolve; });
    const releaseLock = new Promise<void>(resolve => { release = resolve; });
    const promotion = db.transaction(async tx => {
      lifecycle.assertEditableMod(await lifecycle.lockModForMutation(tx, f.modId), f.ownerId);
      await tx.update(schema.betaMods).set({ status: "promoted" }).where(eq(schema.betaMods.id, f.modId));
      locked();
      await releaseLock;
    });
    await lockReady;
    const vote = db.transaction(tx => feedback.recordBuildVote(tx, { betaModId: f.modId, displayedBuildId: f.buildId, testerId: f.testerId, isReady: true }));
    release();
    await promotion;
    await assert.rejects(vote, /read-only/);
    assert.equal((await db.select().from(schema.readySignals).where(eq(schema.readySignals.betaModId, f.modId))).length, 0);
  });
  it("a scan completed before promotion cannot commit a build afterward", async () => {
    const f = await fixture();
    await db.transaction(async tx => {
      await lifecycle.lockModForMutation(tx, f.modId);
      await tx.update(schema.betaMods).set({ status: "promoted" }).where(eq(schema.betaMods.id, f.modId));
    });
    await assert.rejects(db.transaction(async tx => {
      lifecycle.assertEditableMod(await lifecycle.lockModForMutation(tx, f.modId), f.ownerId);
      await tx.insert(schema.builds).values({ betaModId: f.modId, versionLabel: "must-not-exist", fileUrl: "tests/forbidden" });
    }), /read-only/);
    assert.equal((await db.select().from(schema.builds).where(eq(schema.builds.betaModId, f.modId))).length, 1);
  });
});
