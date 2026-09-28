"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "./db";
import { verifySession } from "./dal";
import { betaMods, builds } from "../db/schema";
import { deleteStored } from "./storage";
import { BetaModFormSchema, type BetaModFormState } from "./definitions";

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

  await db
    .update(betaMods)
    .set({
      title,
      game,
      tags: parseTags(tags),
      description: description || null,
      status,
      updatedAt: new Date(),
    })
    .where(
      and(eq(betaMods.id, owned.modId), eq(betaMods.ownerId, owned.userId)),
    );

  redirect(`/mods/${id}`);
}

export async function deleteBetaMod(modId: string) {
  if (!db) redirect("/");

  const owned = await getOwnedMod(modId);
  if (!owned) redirect(`/mods/${modId}`);

  // Collect the object keys BEFORE the delete. Removing the mod cascades to its
  // builds, which cascades to their storage reservations — after the row is
  // gone, nothing left knows these objects exist.
  const fileKeys = (
    await db
      .select({ fileUrl: builds.fileUrl })
      .from(builds)
      .where(eq(builds.betaModId, owned.modId))
  ).map((row) => row.fileUrl);

  await db
    .delete(betaMods)
    .where(
      and(eq(betaMods.id, owned.modId), eq(betaMods.ownerId, owned.userId)),
    );

  // With R2 the archives live in a bucket, so they go too. Failures are logged
  // rather than raised: the builds are already gone from the site, and running
  // this again would not find them. A leftover object surfaces as ledger drift
  // in the admin console instead of quietly eating the pilot's storage budget.
  const results = await Promise.allSettled(
    fileKeys.map((key) => deleteStored(key)),
  );
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    console.error(
      `[deleteBetaMod] ${failed.length}/${fileKeys.length} stored object(s) could not be removed for mod ${owned.modId}`,
    );
  }

  redirect("/dashboard");
}