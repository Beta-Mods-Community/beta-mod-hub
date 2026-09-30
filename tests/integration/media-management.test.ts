import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { readDevEnvironment } from "../../scripts/dev-database.mjs";

const root = path.join(import.meta.dirname, "..", "..");
let devUrl = "";
let safe = false;
try { devUrl = readDevEnvironment(root).DATABASE_URL; safe = true; }
catch { /* Missing or deployment configuration never writes fixtures. */ }
const describeDb = safe ? describe : describe.skip;
type Db = typeof import("../../lib/db");
let database: NonNullable<Db["db"]>;
let client: Db["client"];
let schema: typeof import("../../db/schema");
let service: typeof import("../../lib/media-service");
let ledger: typeof import("../../lib/storage-usage");
let limits: typeof import("../../lib/pilot").PILOT_DEFAULTS;
const ownerId = randomUUID();
const strangerId = randomUUID();
const modId = randomUUID();
const imageIds = [randomUUID(), randomUUID(), randomUUID()];

describeDb("media management transactions (dev DB, no object writes)", () => {
  before(async () => {
    process.env.DATABASE_URL = devUrl;
    process.env.STORAGE_DRIVER = "local";
    const dbModule = await import("../../lib/db");
    database = dbModule.db!;
    client = dbModule.client;
    schema = await import("../../db/schema");
    service = await import("../../lib/media-service");
    ledger = await import("../../lib/storage-usage");
    const { PILOT_DEFAULTS } = await import("../../lib/pilot");
    limits = { ...PILOT_DEFAULTS, uploadsPerWindow: 1000 };
    await database.insert(schema.users).values([{ id: ownerId, displayName: "Media integration owner" }, { id: strangerId, displayName: "Media integration stranger" }]);
    await database.insert(schema.betaMods).values({ id: modId, ownerId, title: "Media integration fixture", game: "test", status: "abandoned" });
    await database.insert(schema.modMedia).values(imageIds.map((id, index) => ({
      id, betaModId: modId, objectKey: `media-test/${modId}/${id}.webp`, mimeType: "image/webp", sizeBytes: 300,
      width: 160, height: 160, position: index, isHero: index === 0, scanState: "clean" as const,
    })));
    await database.insert(schema.storageReservations).values(imageIds.map((mediaId) => ({ userId: ownerId, mediaId, bytes: 300, state: "stored" as const })));
    await database.update(schema.betaMods).set({ status: "beta" }).where(eq(schema.betaMods.id, modId));
  });
  after(async () => {
    if (database) {
      await database.delete(schema.betaMods).where(eq(schema.betaMods.id, modId));
      for (const id of [ownerId, strangerId]) await database.delete(schema.users).where(eq(schema.users.id, id));
    }
    await client?.end();
  });
  const change = (mediaId: string, update: Parameters<typeof service.changeModMediaForUser>[0]["change"], userId = ownerId) => service.changeModMediaForUser({ userId, modId, mediaId, change: update });

  it("enforces ownership again inside the mutation transaction", async () => {
    await assert.rejects(change(imageIds[0], { kind: "caption", caption: "unwanted" }, strangerId), /owner/);
    assert.equal((await service.getModMedia(modId))[0].caption, null);
  });
  it("serializes concurrent cover changes to exactly one cover", async () => {
    await Promise.all([change(imageIds[1], { kind: "hero" }), change(imageIds[2], { kind: "hero" })]);
    assert.equal((await service.getModMedia(modId)).filter((image) => image.isHero).length, 1);
  });
  it("swaps order without violating the immediate position uniqueness constraint", async () => {
    await change(imageIds[2], { kind: "move", direction: "up" });
    assert.deepEqual((await service.getModMedia(modId)).map((image) => image.id), [imageIds[0], imageIds[2], imageIds[1]]);
  });
  it("updates captions and rejects excessive lengths", async () => {
    await change(imageIds[0], { kind: "caption", caption: "  Updated scene  " });
    assert.equal((await service.getModMedia(modId))[0].caption, "Updated scene");
    await assert.rejects(change(imageIds[0], { kind: "caption", caption: "x".repeat(201) }));
    assert.equal((await service.getModMedia(modId))[0].caption, "Updated scene");
  });
  it("rejects changes to promoted and abandoned mods", async () => {
    try {
      for (const status of ["promoted", "abandoned"] as const) {
        await database.update(schema.betaMods).set({ status }).where(eq(schema.betaMods.id, modId));
        await assert.rejects(change(imageIds[0], { kind: "delete" }), /closed/);
      }
    } finally {
      await database.update(schema.betaMods).set({ status: "beta" }).where(eq(schema.betaMods.id, modId));
    }
    assert.equal((await service.getModMedia(modId)).length, 3);
  });
  it("releases the correct media charge and assigns a replacement when deleting the cover", async () => {
    const cover = (await service.getModMedia(modId)).find((image) => image.isHero)!;
    await change(cover.id, { kind: "delete" });
    const images = await service.getModMedia(modId);
    assert.equal(images.length, 2);
    assert.equal(images.filter((image) => image.isHero).length, 1);
    const rows = await database.select().from(schema.storageReservations).where(eq(schema.storageReservations.userId, ownerId));
    assert.equal(rows.reduce((total, row) => total + row.bytes, 0), 600);
    assert.ok(!rows.some((row) => row.mediaId === cover.id));
  });
  it("resizing a hold obeys quota and cannot resize another account's reservation", async () => {
    const result = await ledger.reserveStorage({ userId: ownerId, bytes: 100, limits });
    assert.ok(result.ok);
    if (!result.ok) return;
    try {
      await ledger.resizeHeldReservation(result.reservationId, ownerId, 200, limits);
      await assert.rejects(ledger.resizeHeldReservation(result.reservationId, strangerId, 10, limits), /expired/);
      await assert.rejects(ledger.resizeHeldReservation(result.reservationId, ownerId, 1001, { ...limits, maxArchiveBytes: 1000 }), /large/);
      const [row] = await database.select().from(schema.storageReservations).where(and(eq(schema.storageReservations.id, result.reservationId), eq(schema.storageReservations.state, "held")));
      assert.equal(row.bytes, 200);
    } finally { await ledger.releaseReservation(result.reservationId); }
  });
});
