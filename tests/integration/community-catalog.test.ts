import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
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
let catalog: typeof import("../../lib/catalog");
let notices: typeof import("../../lib/notifications");
const owner = randomUUID();
const followerA = randomUUID();
const followerB = randomUUID();
const stranger = randomUUID();
const userIds = [owner, followerA, followerB, stranger];
const modIds = Array.from({ length: 18 }, () => randomUUID());
const prefix = `catalog-${randomUUID()}`;
const game = `Game ${prefix}`;
const oldBuild = randomUUID();
const currentBuild = randomUUID();

describeDb("catalog and notification boundaries (dev database)", () => {
  before(async () => {
    process.env.DATABASE_URL = local.DATABASE_URL;
    const databaseModule = await import("../../lib/db");
    database = databaseModule.db!;
    client = databaseModule.client;
    schema = await import("../../db/schema");
    community = await import("../../db/community-schema");
    catalog = await import("../../lib/catalog");
    notices = await import("../../lib/notifications");
    await database.insert(schema.users).values(userIds.map((id, index) => ({ id, displayName: `Community fixture ${index}` })));
    await database.insert(schema.betaMods).values(modIds.map((id, index) => ({
      id, ownerId: owner,
      title: `${prefix} ${index === 0 ? "100% alpha" : index === 1 ? "100X alpha" : `entry ${index}`}`,
      game: index === 17 ? `${game} other` : game,
      tags: index === 2 ? ["rare_tag"] : index === 3 ? ["rareXtag"] : [],
      status: index === 15 ? "promoted" as const : index === 16 ? "abandoned" as const : "beta" as const,
      hiddenAt: index === 14 ? new Date() : null,
      createdAt: new Date(Date.UTC(2020, 0, 1) + index * 1000),
      updatedAt: new Date(Date.UTC(2020, 0, 1) + index * 1000),
    })));
    await database.insert(schema.builds).values([
      { id: oldBuild, betaModId: modIds[0], versionLabel: "old", fileUrl: "fixture-not-stored", uploadedAt: new Date("2021-01-01") },
      { id: currentBuild, betaModId: modIds[0], versionLabel: "current", fileUrl: "fixture-not-stored", uploadedAt: new Date("2022-01-01") },
    ]);
    await database.insert(schema.readySignals).values([
      { betaModId: modIds[0], buildId: oldBuild, testerId: followerA, isReady: true },
      { betaModId: modIds[0], buildId: oldBuild, testerId: followerB, isReady: false },
      { betaModId: modIds[0], buildId: currentBuild, testerId: followerA, isReady: true },
    ]);
    await database.insert(community.modFollows).values([owner, followerA, followerB].map(userId => ({ userId, betaModId: modIds[0] })));
  });
  after(async () => {
    if (database) {
      await database.delete(schema.betaMods).where(inArray(schema.betaMods.id, modIds));
      await database.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
    await client?.end();
  });

  it("filters the requested game and excludes moderated/promoted/archived listings before pagination", async () => {
    const first = await catalog.getCatalogPage({ q: prefix, game });
    const second = await catalog.getCatalogPage({ q: prefix, game, page: 2 });
    assert.equal(first.total, 14);
    assert.equal(first.pages, 2);
    assert.equal(first.mods.length, 12);
    assert.equal(second.mods.length, 2);
    const ids = [...first.mods, ...second.mods].map(mod => mod.id);
    assert.equal(new Set(ids).size, 14);
    assert.deepEqual(ids, modIds.slice(0, 14).reverse());
    assert.equal((await catalog.getCatalogPage({ q: prefix, game, page: 999 })).page, 2);
    assert.equal((await catalog.getCatalogPage({ q: prefix, game, page: -1 })).page, 1);
  });
  it("searches names/tags literally, escapes SQL wildcards, and parameterizes search text", async () => {
    assert.deepEqual((await catalog.getCatalogPage({ q: "100%", game })).mods.map(mod => mod.id), [modIds[0]]);
    assert.deepEqual((await catalog.getCatalogPage({ q: "rare_tag", game })).mods.map(mod => mod.id), [modIds[2]]);
    assert.equal((await catalog.getCatalogPage({ q: "' OR 1=1 --", game })).total, 0);
    assert.equal((await catalog.getCatalogPage({ q: game, game })).total, 14);
    assert.equal((await catalog.getCatalogPage({ q: prefix, game: `${game} other` })).total, 1);
  });
  it("needs-testers ordering counts the current build, preserving older votes only as history", async () => {
    const first = await catalog.getCatalogPage({ game, sort: "needs-testers" });
    const second = await catalog.getCatalogPage({ game, sort: "needs-testers", page: 2 });
    const ordered = [...first.mods, ...second.mods];
    assert.equal(ordered[0].id, modIds[1]);
    assert.equal(ordered.at(-1)?.id, modIds[0]);
    assert.equal(ordered.at(-1)?.testerCount, 1);
    assert.equal(ordered.at(-1)?.ready, 1);
  });
  it("hiding and restoring a listing changes visibility and totals immediately", async () => {
    await database.update(schema.betaMods).set({ hiddenAt: new Date() }).where(eq(schema.betaMods.id, modIds[13]));
    const hidden = await catalog.getCatalogPage({ q: prefix, game });
    assert.equal(hidden.total, 13);
    assert.ok(!hidden.mods.some(mod => mod.id === modIds[13]));
    await database.update(schema.betaMods).set({ hiddenAt: null }).where(eq(schema.betaMods.id, modIds[13]));
    assert.equal((await catalog.getCatalogPage({ q: prefix, game })).total, 14);
  });
  it("notifies followers exactly once, excluding the actor and unrelated accounts", async () => {
    await database.transaction(tx => notices.notifyModFollowers(tx, modIds[0], owner, "A new build is available", `/mods/${modIds[0]}`));
    assert.equal((await notices.getNotifications(owner)).length, 0);
    assert.equal((await notices.getNotifications(stranger)).length, 0);
    for (const recipient of [followerA, followerB]) {
      const rows = await notices.getNotifications(recipient);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].userId, recipient);
      assert.equal(rows[0].href, `/mods/${modIds[0]}`);
      assert.equal(await notices.unreadCount(recipient), 1);
    }
  });
  it("direct updates remain private to their recipient and avoid self-notifications", async () => {
    await database.transaction(async tx => {
      await notices.notifyUser(tx, stranger, owner, "x".repeat(300), `/mods/${modIds[0]}`);
      await notices.notifyUser(tx, owner, owner, "Self update", `/mods/${modIds[0]}`);
    });
    const rows = await notices.getNotifications(stranger);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title.length, 240);
    assert.equal((await notices.getNotifications(owner)).length, 0);
    await database.update(community.notifications).set({ read: true }).where(eq(community.notifications.userId, stranger));
    assert.equal(await notices.unreadCount(stranger), 0);
    assert.equal(await notices.unreadCount(followerA), 1);
  });
});
