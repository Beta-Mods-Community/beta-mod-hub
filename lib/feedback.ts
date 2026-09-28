"use server";

import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { db } from "./db";
import { verifySession } from "./dal";
import { betaMods, bugReports, builds, readySignals } from "../db/schema";
import { BugReportFormSchema, type BugReportFormState } from "./definitions";

/**
 * Structured feedback: bug reports and ready/not-ready votes.
 *
 * Per the spec there is deliberately NO comment wall — only structured
 * reports with severity + repro steps, and one ready signal per tester/build.
 */

export async function submitBugReport(
  state: BugReportFormState,
  formData: FormData,
): Promise<BugReportFormState> {
  const betaModId = String(formData.get("betaModId") ?? "");
  if (!betaModId) return { message: "Missing mod id." };

  const validatedFields = BugReportFormSchema.safeParse({
    buildId: formData.get("buildId"),
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

  const { buildId, severity, description, reproSteps } = validatedFields.data;

  // A build id is user-controlled form input. Confirm it belongs to this mod
  // before recording the report so feedback can never be attributed across
  // mod pages.
  const affectedBuild = await db
    .select({ id: builds.id })
    .from(builds)
    .where(and(eq(builds.id, buildId), eq(builds.betaModId, betaModId)))
    .limit(1);
  if (!affectedBuild[0]) {
    return { message: "Choose a build from this beta mod." };
  }

  await db.insert(bugReports).values({
    betaModId,
    buildId,
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
 * Cast or change a ready/not-ready verdict for the newest build. One row per
 * (build_id, tester_id) means uploading a new build starts a fresh release
 * signal while keeping prior-build verdicts for history and reputation.
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

  // Resolve this at action time rather than trusting a hidden form field. If
  // an author uploads a build while the tester has the page open, the verdict
  // belongs to the build that is current when it is submitted.
  const buildRows = await db
    .select({ id: builds.id })
    .from(builds)
    .where(eq(builds.betaModId, betaModId))
    .orderBy(desc(builds.uploadedAt), desc(builds.id))
    .limit(1);
  const latestBuild = buildRows[0];
  if (!latestBuild) redirect(`/mods/${betaModId}`);

  await db
    .insert(readySignals)
    .values({
      betaModId,
      buildId: latestBuild.id,
      testerId: session.userId,
      isReady,
    })
    .onConflictDoUpdate({
      target: [readySignals.buildId, readySignals.testerId],
      set: { betaModId, isReady, createdAt: new Date() },
    });

  redirect(`/mods/${betaModId}`);
}
