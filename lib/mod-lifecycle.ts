import "server-only";

import { eq } from "drizzle-orm";
import { betaMods } from "../db/schema";
import { db } from "./db";

export type ModTransaction = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0];

export class ModMutationError extends Error {}

/** Every mutation and promotion locks the same row for its final DB write. */
export async function lockModForMutation(tx: ModTransaction, modId: string) {
  const [mod] = await tx.select().from(betaMods).where(eq(betaMods.id, modId)).for("update");
  return mod ?? null;
}

export function assertEditableMod<T extends { ownerId: string; status: string; hiddenAt?: Date | null }>(
  mod: T | null | undefined,
  ownerId?: string,
): asserts mod is T {
  if (!mod) throw new ModMutationError("This mod is no longer available.");
  if (ownerId !== undefined && mod.ownerId !== ownerId) {
    throw new ModMutationError("Only the mod author can make this change.");
  }
  if (mod.status === "promoted") {
    throw new ModMutationError("This mod has been published on Nexus and is read-only.");
  }
  if (mod.status === "abandoned") throw new ModMutationError("This mod is archived and is read-only.");
  if (mod.hiddenAt) throw new ModMutationError("This mod is unavailable while it is under review.");
}

/** Archiving prevents edits, not owner deletion; published and moderated mods remain protected. */
export function assertDeletableMod<T extends { ownerId: string; status: string; hiddenAt?: Date | null }>(
  mod: T | null | undefined,
  ownerId: string,
): asserts mod is T {
  if (!mod) throw new ModMutationError("This mod is no longer available.");
  if (mod.ownerId !== ownerId) {
    throw new ModMutationError("Only the mod author can make this change.");
  }
  if (mod.status === "promoted") {
    throw new ModMutationError("This mod has been published on Nexus and is read-only.");
  }
  if (mod.hiddenAt) throw new ModMutationError("This mod is unavailable while it is under review.");
}

export function mutationMessage(error: unknown): string {
  return error instanceof ModMutationError ? error.message : "Could not save this change. Please try again.";
}
