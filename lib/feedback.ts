"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { verifySession } from "./dal";
import { betaMods, bugReports, readySignals } from "../db/schema";
import { BugReportFormSchema, type BugReportFormState } from "./definitions";

/**
 * Structured feedback: bug reports and ready/not-ready votes.
 *
 * Per the spec there is deliberately NO comment wall — only structured
 * reports with severity + repro steps, and a single ready signal per tester.
 */

export async function submitBugReport(
  state: BugReportFormState,
  formData: FormData,
): Promise<BugReportFormState> {
  const betaModId = String(formData.get("betaModId") ?? "");
  if (!betaModId) return { message: "Missing mod id." };

  const validatedFields = BugReportFormSchema.safeParse({
    severity: formData.get("severity"),
    description: formData.get("description"),
    reproSteps: formData.get("reproSteps"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const session = await verifySession();
  if (!db) {
    return { message: "The database isn't configured yet — try again shortly." };
  }

  const { severity, description, reproSteps } = validatedFields.data;
  await db.insert(bugReports).values({
    betaModId,
    reporterId: session.userId,
    severity,
    description,
    reproSteps: reproSteps || null,
  });

  redirect(`/mods/${betaModId}`);
}

export async function setBugReportStatus(
  bugReportId: string,
  status: "open" | "acknowledged" | "fixed",
) {
  if (!db) redirect("/");

  const session = await verifySession();

  // Owner-only: the report belongs to a mod, the mod has an owner.
  const reportRows = await db
    .select({ betaModId: bugReports.betaModId })
    .from(bugReports)
    .where(eq(bugReports.id, bugReportId))
    .limit(1);
  const report = reportRows[0];
  if (!report) redirect("/");

  const modRows = await db
    .select({ ownerId: betaMods.ownerId })
    .from(betaMods)
    .where(eq(betaMods.id, report.betaModId))
    .limit(1);
  const mod = modRows[0];
  if (!mod || mod.ownerId !== session.userId) {
    redirect(`/mods/${report.betaModId}`);
  }

  await db
    .update(bugReports)
    .set({ status })
    .where(eq(bugReports.id, bugReportId));

  redirect(`/mods/${report.betaModId}`);
}

/**
 * Cast or change a ready/not-ready vote. One row per (beta_mod_id, tester_id)
 * — repeat votes upsert instead of stacking.
 */
export async function voteReady(betaModId: string, isReady: boolean) {
  if (!db) redirect("/");

  const session = await verifySession();

  // Authors don't vote on their own betas — the signal is for testers.
  const modRows = await db
    .select({ ownerId: betaMods.ownerId })
    .from(betaMods)
    .where(eq(betaMods.id, betaModId))
    .limit(1);
  const mod = modRows[0];
  if (!mod) redirect("/browse");
  if (mod.ownerId === session.userId) redirect(`/mods/${betaModId}`);

  await db
    .insert(readySignals)
    .values({ betaModId, testerId: session.userId, isReady })
    .onConflictDoUpdate({
      target: [readySignals.betaModId, readySignals.testerId],
      set: { isReady, createdAt: new Date() },
    });

  redirect(`/mods/${betaModId}`);
}