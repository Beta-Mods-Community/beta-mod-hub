"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { verifySession } from "./dal";
import { requirements } from "../db/schema";
import { RequirementFormSchema } from "./definitions";
import { assertEditableMod, lockModForMutation, mutationMessage } from "./mod-lifecycle";
import { getAccountWriteError } from "./access";

/**
 * Requirements CRUD — the author-declared dependency list that feeds the
 * promotion package's `requirements.txt`. Self-reported per the spec (no
 * Nexus verification here; requirements auto-suggest is phase 4).
 */

export async function addRequirement(formData: FormData) {
  const betaModId = String(formData.get("betaModId") ?? "");
  if (!betaModId) redirect("/dashboard");

  const session = await verifySession();
  const accessError = await getAccountWriteError(session.userId);
  if (accessError) redirect(`/mods/${betaModId}?feedback=${encodeURIComponent(accessError)}`);

  const parsed = RequirementFormSchema.safeParse({
    nexusModName: formData.get("nexusModName"),
    nexusModUrl: formData.get("nexusModUrl"),
  });
  if (!parsed.success || !db) redirect(`/mods/${betaModId}`);
  if (parsed.data.nexusModUrl && !["https:", "http:"].includes(new URL(parsed.data.nexusModUrl).protocol)) {
    redirect(`/mods/${betaModId}?req=invalid#requirements`);
  }

  let errorMessage: string | undefined;
  try {
    await db.transaction(async tx => {
      assertEditableMod(await lockModForMutation(tx, betaModId), session.userId);
      await tx.insert(requirements).values({ betaModId, ...parsed.data });
    });
  } catch (error) { errorMessage = mutationMessage(error); }

  redirect(`/mods/${betaModId}${errorMessage ? `?feedback=${encodeURIComponent(errorMessage)}` : ""}#requirements`);
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

  const session = await verifySession();
  let errorMessage = await getAccountWriteError(session.userId);
  if (!errorMessage) {
    try {
      await db.transaction(async tx => {
        assertEditableMod(await lockModForMutation(tx, row.betaModId), session.userId);
        await tx.delete(requirements).where(eq(requirements.id, requirementId));
      });
    } catch (error) { errorMessage = mutationMessage(error); }
  }
  redirect(`/mods/${row.betaModId}${errorMessage ? `?feedback=${encodeURIComponent(errorMessage)}` : ""}#requirements`);
}
