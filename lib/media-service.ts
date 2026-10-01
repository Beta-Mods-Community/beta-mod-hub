import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { betaMods, modMedia, storageReservations } from "../db/schema";
import { db } from "./db";
import { getAccountWriteError } from "./account-write-access";
import { MAX_MEDIA_BYTES } from "./image-meta";
import { assertMediaOwner, MAX_MOD_IMAGES, MediaCaptionSchema, MediaIdSchema, MediaError } from "./media-policy";
import { processMediaUpload } from "./media-upload";
import { lockModForMutation } from "./mod-lifecycle";
import { readPilotLimits } from "./pilot";
import { cloudPilotEnabled, CLOUD_UPLOAD_BYTES } from "./cloud-pilot";
import { deleteStored } from "./storage";
import { getUploadPermission, releaseReservation, reserveStorage, resizeHeldReservation, retainReservationForCleanup } from "./storage-usage";

/** Only published clean rows are suitable for a gallery or promotion package. */
export async function getModMedia(modId: string) {
  if (!db || !MediaIdSchema.safeParse(modId).success) return [];
  return db.select().from(modMedia).where(and(eq(modMedia.betaModId, modId), eq(modMedia.scanState, "clean")))
    .orderBy(asc(modMedia.position));
}

export async function uploadModMediaForUser(input: { userId: string; modId: string; file: File; caption: string }) {
  if (!db) throw new MediaError("The database is unavailable.");
  const modId = MediaIdSchema.parse(input.modId);
  const caption = MediaCaptionSchema.parse(input.caption);
  const maxBytes = cloudPilotEnabled() ? CLOUD_UPLOAD_BYTES : MAX_MEDIA_BYTES;
  if (!input.file.size || input.file.size > maxBytes) throw new MediaError(`Choose an image no larger than ${maxBytes / 1024 / 1024} MiB.`);
  const [mod] = await db.select().from(betaMods).where(eq(betaMods.id, modId));
  assertMediaOwner(mod, input.userId);
  if ((await getModMedia(modId)).length >= MAX_MOD_IMAGES) throw new MediaError(`A mod can have up to ${MAX_MOD_IMAGES} screenshots. Remove one before uploading another.`);
  const limits = readPilotLimits();
  const permission = await getUploadPermission(input.userId, limits);
  if (!permission.allowed) throw new MediaError(permission.message);
  const reservation = await reserveStorage({ userId: input.userId, bytes: input.file.size, limits });
  if (!reservation.ok) throw new MediaError(reservation.message);
  const reservationId = reservation.reservationId;
  const database = db;
  return processMediaUpload({
    modId,
    file: input.file,
    resizeReservation: (bytes) => resizeHeldReservation(reservationId, input.userId, bytes, limits),
    releaseReservation: () => releaseReservation(reservationId),
    retainReservation: () => retainReservationForCleanup(reservationId),
    isPublished: async (id) => Boolean((await database.select({ id: modMedia.id }).from(modMedia).where(eq(modMedia.id, id)))[0]),
    publish: async (image) => {
      await database.transaction(async (tx) => {
        const current = await lockModForMutation(tx, modId);
        assertMediaOwner(current ?? undefined, input.userId);
        const accountError = await getAccountWriteError(input.userId, tx);
        if (accountError) throw new MediaError(accountError);
        const latestPermission = await getUploadPermission(input.userId, limits, tx);
        if (!latestPermission.allowed) throw new MediaError(latestPermission.message);
        const rows = await tx.select().from(modMedia).where(eq(modMedia.betaModId, modId)).orderBy(asc(modMedia.position));
        if (rows.length >= MAX_MOD_IMAGES) throw new MediaError(`A mod can have up to ${MAX_MOD_IMAGES} screenshots.`);
        const [held] = await tx.select().from(storageReservations).where(and(
          eq(storageReservations.id, reservationId), eq(storageReservations.state, "held"), eq(storageReservations.userId, input.userId),
        )).for("update");
        if (!held || held.bytes !== image.sizeBytes) throw new MediaError("The upload reservation expired. Please retry.");
        await tx.insert(modMedia).values({ ...image, betaModId: modId, caption: caption || null,
          scanState: "clean", position: (rows.at(-1)?.position ?? -1) + 1, isHero: rows.length === 0 });
        await tx.update(storageReservations).set({ mediaId: image.id, state: "stored", settledAt: new Date() })
          .where(eq(storageReservations.id, reservationId));
        await tx.update(betaMods).set({ updatedAt: new Date() }).where(eq(betaMods.id, modId));
      });
    },
  });
}

export type MediaChange = { kind: "caption"; caption: string } | { kind: "hero" } | { kind: "move"; direction: "up" | "down" } | { kind: "delete" };

export async function changeModMediaForUser(input: { userId: string; modId: string; mediaId: string; change: MediaChange }) {
  if (!db) throw new MediaError("The database is unavailable.");
  MediaIdSchema.parse(input.modId);
  MediaIdSchema.parse(input.mediaId);
  await db.transaction(async (tx) => {
    const mod = await lockModForMutation(tx, input.modId);
    assertMediaOwner(mod ?? undefined, input.userId);
    const rows = await tx.select().from(modMedia).where(eq(modMedia.betaModId, input.modId)).orderBy(asc(modMedia.position));
    const index = rows.findIndex((row) => row.id === input.mediaId);
    const media = rows[index];
    if (!media) throw new MediaError("This screenshot is no longer available.");
    switch (input.change.kind) {
      case "caption":
        await tx.update(modMedia).set({ caption: MediaCaptionSchema.parse(input.change.caption) || null, updatedAt: new Date() }).where(eq(modMedia.id, media.id));
        break;
      case "hero":
        await tx.update(modMedia).set({ isHero: false }).where(eq(modMedia.betaModId, input.modId));
        await tx.update(modMedia).set({ isHero: true, updatedAt: new Date() }).where(eq(modMedia.id, media.id));
        break;
      case "move": {
        const neighbor = rows[index + (input.change.direction === "up" ? -1 : 1)];
        if (!neighbor) break;
        // The index is immediate (not deferrable); use an unused slot to swap.
        await tx.update(modMedia).set({ position: -1 }).where(eq(modMedia.id, media.id));
        await tx.update(modMedia).set({ position: media.position }).where(eq(modMedia.id, neighbor.id));
        await tx.update(modMedia).set({ position: neighbor.position, updatedAt: new Date() }).where(eq(modMedia.id, media.id));
        break;
      }
      case "delete": {
        // Never drop the row/charge before storage confirms removal. A failed
        // delete remains indexed and retryable instead of becoming an orphan.
        await deleteStored(media.objectKey);
        await tx.delete(modMedia).where(eq(modMedia.id, media.id));
        if (media.isHero) {
          const replacement = rows.find((row) => row.id !== media.id);
          if (replacement) await tx.update(modMedia).set({ isHero: true }).where(eq(modMedia.id, replacement.id));
        }
        break;
      }
    }
    await tx.update(betaMods).set({ updatedAt: new Date() }).where(eq(betaMods.id, input.modId));
  });
}
