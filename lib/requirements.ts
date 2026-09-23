"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { verifySession } from "./dal";
import { betaMods, requirements } from "../db/schema";
import { RequirementFormSchema } from "./definitions";

/**
 * Requirements CRUD — the author-declared dependency list that feeds the
 * promotion package's `requirements.txt`. Self-reported per the spec (no
 * Nexus verification here; requirements auto-suggest is phase 4).
 */

async function ownedModId(betaModId: string): Promise<string | null> {
  if (!db) return null;
  const session = await verifySession();

  const rows = await db
    .select({ id: betaMods.id, ownerId: betaMods.ownerId })
    .from(betaMods)
    .where(eq(betaMods.id, betaModId))
    .limit(1);

  const mod = rows[0];
  if (!mod || mod.ownerId !== session.userId) return null;
  return mod.id;
}

export async function addRequirement(formData: FormData) {
  const betaModId = String(formData.get("betaModId") ?? "");
  if (!betaModId) redirect("/dashboard");

  const owned = await ownedModId(betaModId);
  if (!owned) redirect(`/mods/${betaModId}`);

  const parsed = RequirementFormSchema.safeParse({
    nexusModName: formData.get("nexusModName"),
    nexusModUrl: formData.get("nexusModUrl"),
  });
  if (!parsed.success || !db) redirect(`/mods/${betaModId}`);

  await db!.insert(requirements).values({
    betaModId,
    nexusModName: parsed.data.nexusModName,
    nexusModUrl: parsed.data.nexusModUrl,
  });

  redirect(`/mods/${betaModId}`);
}

export async function removeRequirement(requirementId: string) {
  if (!db) redirect("/dashboard");

  const rows = await db
    .select({ betaModId: requirements.betaModId })
    .from(requirements)
    .where(eq(requirements.id, requirementId))
    .limit(1);
  const row = rows[0];
  if (!row) redirect("/dashboard");

  const owned = await ownedModId(row.betaModId);
  if (!owned) redirect(`/mods/${row.betaModId}`);

  await db
    .delete(requirements)
    .where(eq(requirements.id, requirementId));

  redirect(`/mods/${row.betaModId}`);
}