"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "./db";
import { verifySession } from "./dal";
import { betaMods, builds, modMedia, storageReservations } from "../db/schema";
import { bugAttachments } from "../db/feedback-schema";
import { deleteStored } from "./storage";
import { BetaModFormSchema, type BetaModFormState } from "./definitions";
import { assertDeletableMod, assertEditableMod, lockModForMutation, mutationMessage } from "./mod-lifecycle";
import { getAccountWriteError } from "./access";

function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean),
    ),
  ].slice(0, 8);
}

/**
 * Returns { modId, userId } when the session user owns the mod, otherwise null.
 * Callers redirect on null — never proceed with an unowned mutation.
 */
async function getOwnedMod(modId: string) {
  const session = await verifySession();
  if (!db) return null;

  const rows = await db
    .select({ id: betaMods.id, ownerId: betaMods.ownerId })
    .from(betaMods)
    .where(eq(betaMods.id, modId))
    .limit(1);

  const mod = rows[0];
  if (!mod || mod.ownerId !== session.userId) return null;
  return { modId: mod.id, userId: session.userId };
}

export async function createBetaMod(
  state: BetaModFormState,
  formData: FormData,
): Promise<BetaModFormState> {
  const validatedFields = BetaModFormSchema.safeParse({
    title: formData.get("title"),
    game: formData.get("game"),
    tags: formData.get("tags"),
    description: formData.get("description"),
    status: formData.get("status"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  if (!db) {
    return { message: "The database isn't configured yet — try again shortly." };
  }

  const session = await verifySession();
  const accessError = await getAccountWriteError(session.userId);
  if (accessError) return { message: accessError };
  const { title, game, tags, description, status } = validatedFields.data;

  const inserted = await db
    .insert(betaMods)
    .values({
      ownerId: session.userId,
      title,
      game,
      tags: parseTags(tags),
      description: description || null,
      status,
    })
    .returning({ id: betaMods.id });

  const mod = inserted[0];
  if (!mod) {
    return { message: "Something went wrong creating your beta mod." };
  }

  redirect(`/mods/${mod.id}`);
}

export async function updateBetaMod(
  state: BetaModFormState,
  formData: FormData,
): Promise<BetaModFormState> {
  const validatedFields = BetaModFormSchema.safeParse({
    title: formData.get("title"),
    game: formData.get("game"),
    tags: formData.get("tags"),
    description: formData.get("description"),
    status: formData.get("status"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { message: "Missing mod id." };

  const owned = await getOwnedMod(id);
  if (!owned) redirect(`/mods/${id}`);

  if (!db) {
    return { message: "The database isn't configured yet — try again shortly." };
  }

  const { title, game, tags, description, status } = validatedFields.data;
  const accessError = await getAccountWriteError(owned.userId);
  if (accessError) return { message: accessError };
  try {
    await db.transaction(async tx => {
      assertEditableMod(await lockModForMutation(tx, id), owned.userId);
      await tx.update(betaMods).set({ title, game, tags: parseTags(tags), description: description || null, status, updatedAt: new Date() })
        .where(and(eq(betaMods.id, owned.modId), eq(betaMods.ownerId, owned.userId)));
    });
  } catch (error) { return { message: mutationMessage(error) }; }

  redirect(`/mods/${id}`);
}

export async function deleteBetaMod(modId: string) {
  if (!db) redirect("/");

  const owned = await getOwnedMod(modId);
  if (!owned) redirect(`/mods/${modId}`);

  let errorMessage = await getAccountWriteError(owned.userId);
  if (!errorMessage) {
    try {
      await db.transaction(async tx => {
        assertDeletableMod(await lockModForMutation(tx, modId), owned.userId);
        const archives = await tx.select({ key: builds.fileUrl }).from(builds).where(eq(builds.betaModId, modId));
        const media = await tx.select({ key: modMedia.objectKey }).from(modMedia).where(eq(modMedia.betaModId, modId));
        const attachments = await tx.select({ key: bugAttachments.objectKey, reservationId: bugAttachments.reservationId })
          .from(bugAttachments).where(eq(bugAttachments.betaModId, modId));
        // Keep rows and quota if a storage delete fails. A retry can remove an
        // already-deleted key safely; losing the only object index cannot.
        for (const row of [...archives, ...media, ...attachments]) await deleteStored(row.key);
        await tx.delete(betaMods).where(eq(betaMods.id, modId));
        if (attachments.length) await tx.delete(storageReservations)
          .where(inArray(storageReservations.id, attachments.map(row => row.reservationId)));
      });
    } catch (error) { errorMessage = mutationMessage(error); }
  }
  if (errorMessage) redirect(`/mods/${modId}?feedback=${encodeURIComponent(errorMessage)}`);

  redirect("/dashboard");
}
