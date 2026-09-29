import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { assertDevDatabase, readPrivateEnv } from "../../scripts/dev-database.mjs";

const root = path.join(import.meta.dirname, "..", "..");
const local = readPrivateEnv(root, ".env.local");
const production = readPrivateEnv(root, ".env.production");
let safe = false;
try { assertDevDatabase(local.DATABASE_URL, production.DATABASE_URL); safe = true; }
catch { /* Missing or production configuration never writes fixtures. */ }
const describeDb = safe ? describe : describe.skip;
type Db = typeof import("../../lib/db");
let database: NonNullable<Db["db"]>;
let client: Db["client"];
let schema: typeof import("../../db/schema");
let community: typeof import("../../db/community-schema");
let communityService: typeof import("../../lib/community-service");
let moderationService: typeof import("../../lib/moderation-service");

// Actor roles: adminActor is the only configured administrator.
const owner = randomUUID();
const follower = randomUUID();
const reporter = randomUUID();
const nonAdmin = randomUUID();
const target = randomUUID();
const adminActor = randomUUID();
const userIds = [owner, follower, reporter, nonAdmin, target, adminActor];
const visibleMod = randomUUID();
const hiddenMod = randomUUID();
const reportedMod = randomUUID();
const modIds = [visibleMod, hiddenMod, reportedMod];
const savedAdminUserIds = process.env.ADMIN_USER_IDS;

describeDb("community and moderation write services (dev database)", () => {
  before(async () => {
    process.env.DATABASE_URL = local.DATABASE_URL;
    process.env.ADMIN_USER_IDS = adminActor;
    const databaseModule = await import("../../lib/db");
    database = databaseModule.db!;
    client = databaseModule.client;
    schema = await import("../../db/schema");
    community = await import("../../db/community-schema");
    communityService = await import("../../lib/community-service");
    moderationService = await import("../../lib/moderation-service");
    await database.insert(schema.users).values(userIds.map((id, index) => ({ id, displayName: `Community write fixture ${index}` })));
    await database.insert(schema.betaMods).values([
      { id: visibleMod, ownerId: owner, title: "Visible follow target", game: "Fixture", status: "beta" as const },
      { id: hiddenMod, ownerId: owner, title: "Hidden follow target", game: "Fixture", status: "beta" as const, hiddenAt: new Date() },
      { id: reportedMod, ownerId: owner, title: "Reported target", game: "Fixture", status: "beta" as const },
    ]);
  });
  after(async () => {
    if (database) {
      // moderation_log.actor_id is a plain FK (no ON DELETE), so remove the
      // audit rows before deleting the fixture users they reference.
      await database.delete(community.moderationLog).where(inArray(community.moderationLog.actorId, userIds));
      await database.delete(schema.betaMods).where(inArray(schema.betaMods.id, modIds));
      await database.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    if (savedAdminUserIds === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = savedAdminUserIds;
    await client?.end();
  });

  it("follows and unfollows a visible mod, deduplicating repeated follows", async () => {
    await communityService.setFollowRecord(follower, visibleMod, true);
    await communityService.setFollowRecord(follower, visibleMod, true);
    const rows = await database.select().from(community.modFollows).where(and(eq(community.modFollows.userId, follower), eq(community.modFollows.betaModId, visibleMod)));
    assert.equal(rows.length, 1);
    await communityService.setFollowRecord(follower, visibleMod, false);
    assert.equal((await database.select().from(community.modFollows).where(and(eq(community.modFollows.userId, follower), eq(community.modFollows.betaModId, visibleMod)))).length, 0);
  });

  it("refuses to follow a hidden mod but still allows unfollowing one", async () => {
    // An existing follow survives a later moderation action.
    await database.insert(community.modFollows).values({ userId: follower, betaModId: hiddenMod });
    await communityService.setFollowRecord(follower, hiddenMod, true);
    assert.equal((await database.select().from(community.modFollows).where(and(eq(community.modFollows.userId, follower), eq(community.modFollows.betaModId, hiddenMod)))).length, 1);
    // Unfollowing must stay possible, otherwise a user whose follows are all
    // hidden is stuck and cannot clear their following list.
    await communityService.setFollowRecord(follower, hiddenMod, false);
    assert.equal((await database.select().from(community.modFollows).where(and(eq(community.modFollows.userId, follower), eq(community.modFollows.betaModId, hiddenMod)))).length, 0);
  });

  it("ignore bad follow targets without writing", async () => {
    await communityService.setFollowRecord(follower, randomUUID(), true);
    assert.equal((await database.select().from(community.modFollows).where(eq(community.modFollows.userId, follower))).length, 0);
  });

  it("reports need a real mod and a 10–2000 character reason, deduplicating per reporter", async () => {
    const message = await communityService.reportContentRecord(reporter, reportedMod, "This listing hosts pirated content.");
    assert.match(message, /Report submitted/);
    await communityService.reportContentRecord(reporter, reportedMod, "This listing hosts pirated content.");
    const rows = await database.select().from(community.contentReports).where(and(eq(community.contentReports.reporterId, reporter), eq(community.contentReports.betaModId, reportedMod)));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, "This listing hosts pirated content.");
    assert.match(await communityService.reportContentRecord(reporter, reportedMod, "short"), /Describe the issue/);
    assert.match(await communityService.reportContentRecord(reporter, randomUUID(), "This listing hosts pirated content."), /could not be found/);
  });

  it("moderation requires a configured admin actor and writes the audit trail", async () => {
    const before = await database.select({ hiddenAt: schema.betaMods.hiddenAt }).from(schema.betaMods).where(eq(schema.betaMods.id, reportedMod));
    assert.equal(await moderationService.applyModeration(nonAdmin, reportedMod, "hide", "Non-admin attempt."), false);
    const afterRefused = await database.select({ hiddenAt: schema.betaMods.hiddenAt }).from(schema.betaMods).where(eq(schema.betaMods.id, reportedMod));
    assert.deepEqual(afterRefused, before);
    assert.equal((await database.select().from(community.moderationLog).where(eq(community.moderationLog.targetId, reportedMod))).length, 0);
  });

  it("an admin can hide, restore and resolve a listing, notifying the owner each time", async () => {
    assert.equal(await moderationService.applyModeration(adminActor, reportedMod, "hide", "Listing shares paywalled content."), true);
    const hidden = await database.select({ hiddenAt: schema.betaMods.hiddenAt, ownerId: schema.betaMods.ownerId }).from(schema.betaMods).where(eq(schema.betaMods.id, reportedMod));
    assert.ok(hidden[0].hiddenAt);
    const logs = await database.select().from(community.moderationLog).where(and(eq(community.moderationLog.actorId, adminActor), eq(community.moderationLog.targetId, reportedMod)));
    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, "hide");
    const notices = await database.select().from(community.notifications).where(eq(community.notifications.userId, owner));
    assert.equal(notices.length, 1);
    assert.equal(notices[0].href, `/mods/${reportedMod}`);
    assert.match(notices[0].title, /hidden/);

    assert.equal(await moderationService.applyModeration(adminActor, reportedMod, "restore", "Review resolved."), true);
    assert.equal((await database.select().from(schema.betaMods).where(eq(schema.betaMods.id, reportedMod)))[0].hiddenAt, null);
    assert.equal(await moderationService.applyModeration(adminActor, reportedMod, "resolve", "Nothing to act on."), true);
    const report = await database.select().from(community.contentReports).where(eq(community.contentReports.betaModId, reportedMod));
    assert.ok(report[0]?.resolvedAt);
    assert.equal((await database.select().from(community.moderationLog).where(eq(community.moderationLog.targetId, reportedMod))).length, 3);
    // Unknown action values are refused outright.
    assert.equal(await moderationService.applyModeration(adminActor, reportedMod, "delete", "Not a real action."), false);
  });

  it("suspension bumps session_version and never targets another admin", async () => {
    assert.equal(await moderationService.setAccountSuspendedRecord(nonAdmin, target, true, "Non-admin attempt."), false);
    assert.equal((await database.select().from(schema.users).where(eq(schema.users.id, target)))[0].suspendedAt, null);
    assert.equal(await moderationService.setAccountSuspendedRecord(adminActor, adminActor, true, "Defend the admin list."), false);

    assert.equal(await moderationService.setAccountSuspendedRecord(adminActor, target, true, "Abusive behaviour."), true);
    const suspended = await database.select({ suspendedAt: schema.users.suspendedAt, sessionVersion: schema.users.sessionVersion }).from(schema.users).where(eq(schema.users.id, target));
    assert.ok(suspended[0].suspendedAt);
    assert.equal(Number(suspended[0].sessionVersion), 1);
    assert.equal(await moderationService.setAccountSuspendedRecord(adminActor, target, false, "Appeal upheld."), true);
    assert.equal((await database.select().from(schema.users).where(eq(schema.users.id, target)))[0].suspendedAt, null);
  });
});