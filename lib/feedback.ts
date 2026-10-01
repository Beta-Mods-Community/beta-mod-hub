"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { verifySession } from "./dal";
import { bugReports, builds, storageReservations } from "../db/schema";
import { bugAttachments, bugReportWorkflow } from "../db/feedback-schema";
import { BugReportFormSchema, type BugReportFormState } from "./definitions";
import { assertEditableMod, lockModForMutation, ModMutationError, mutationMessage } from "./mod-lifecycle";
import { AuthorResponseSchema, RetestSchema, validateAttachment, validateAttachmentContents } from "./feedback-policy";
import { recordBuildVote } from "./feedback-write";
import { getAccountWriteError } from "./access";
import { notifyModFollowers, notifyUser } from "./notifications";
import { readPilotLimits, isCloudPilot, CLOUD_PILOT_CEILINGS } from "./pilot";
import { validateCloudFeedback } from "./cloud-feedback-policy";
import { getUploadPermission, releaseReservation, reserveStorage, retainReservationForCleanup } from "./storage-usage";
import { deleteQuarantine, deleteStored, promoteQuarantine, readQuarantine, sanitizeFilename, storageKey, writeQuarantine } from "./storage";
import { scanUpload } from "./scan";

function feedbackLocation(modId: string, error?: string) {
  return `/mods/${modId}${error ? `?feedback=${encodeURIComponent(error)}` : ""}#bugs`;
}

function refreshFeedback(modId: string) {
  revalidatePath(`/mods/${modId}`);
  revalidatePath("/browse");
  revalidatePath("/");
  revalidatePath("/dashboard");
}

/** One report, optionally one private scanned log/save attachment. */
export async function submitBugReport(_state: BugReportFormState, formData: FormData): Promise<BugReportFormState> {
  const betaModId = String(formData.get("betaModId") ?? "");
  if (!betaModId) return { message: "Missing mod id." };
  const parsed = BugReportFormSchema.safeParse({
    buildId: formData.get("buildId"), severity: formData.get("severity"),
    description: String(formData.get("description") ?? "").trim(), reproSteps: formData.get("reproSteps"),
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const session = await verifySession();
  if (!db) return { message: "The database is unavailable. Try again shortly." };
  const accessError = await getAccountWriteError(session.userId);
  if (accessError) return { message: accessError };

  // Refuse invalid targets before doing upload work, then lock/recheck at commit.
  try {
    await db.transaction(async tx => {
      assertEditableMod(await lockModForMutation(tx, betaModId));
      const [build] = await tx.select({ id: builds.id }).from(builds)
        .where(and(eq(builds.id, parsed.data.buildId), eq(builds.betaModId, betaModId)));
      if (!build) throw new ModMutationError("Choose a build from this mod.");
    });
  } catch (error) { return { message: mutationMessage(error) }; }

  const rawAttachment = formData.get("attachment");
  const file = rawAttachment instanceof File && rawAttachment.size > 0 ? rawAttachment : null;
  if (file) {
    if (isCloudPilot() && file.size > CLOUD_PILOT_CEILINGS.maxArchiveBytes) return { message: "Pilot attachments must be no larger than 8 MiB." };
    const invalid = validateAttachment(file.name, file.size);
    if (invalid) return { message: invalid };
  }
  const reportId = randomUUID();
  let reservationId: string | null = null;
  let quarantineKey: string | null = null;
  let finalKey: string | null = null;
  let storageAttempted = false;
  let storageCompleted = false;
  let commitAttempted = false;
  try {
    if (file) {
      const limits = readPilotLimits();
      const permission = await getUploadPermission(session.userId, limits);
      if (!permission.allowed) return { message: permission.message };
      const reserved = await reserveStorage({ userId: session.userId, bytes: file.size, limits });
      if (!reserved.ok) return { message: reserved.message };
      reservationId = reserved.reservationId;
      quarantineKey = writeQuarantine(new Uint8Array(await file.arrayBuffer()));
      const bytes = readQuarantine(quarantineKey);
      if (!bytes) throw new Error("Missing quarantined attachment");
      const contentError = validateAttachmentContents(file.name, bytes);
      if (contentError) throw new ModMutationError(contentError);
      if (isCloudPilot()) {
        const error = await validateCloudFeedback(file.name, bytes);
        if (error) throw new ModMutationError(error);
      }
      const scan = await scanUpload(bytes);
      if (!scan.ok) throw new ModMutationError(scan.reason === "infected"
        ? "Attachment blocked because the malware scanner flagged it."
        : "Attachment scan is unavailable. Your report was not submitted; try again or remove the attachment.");
      finalKey = storageKey(`attachments/${reportId}/${randomUUID()}`, file.name);
      storageAttempted = true;
      await promoteQuarantine(quarantineKey, finalKey);
      storageCompleted = true;
    }
    const storedKey = finalKey;
    const heldId = reservationId;
    commitAttempted = true;
    await db.transaction(async tx => {
      const mod = await lockModForMutation(tx, betaModId);
      assertEditableMod(mod);
      const accountError = await getAccountWriteError(session.userId, tx);
      if (accountError) throw new ModMutationError(accountError);
      if (file) {
        const latestPermission = await getUploadPermission(session.userId, readPilotLimits(), tx);
        if (!latestPermission.allowed) throw new ModMutationError(latestPermission.message);
      }
      const [build] = await tx.select({ id: builds.id }).from(builds)
        .where(and(eq(builds.id, parsed.data.buildId), eq(builds.betaModId, betaModId)));
      if (!build) throw new ModMutationError("Choose a build from this mod.");
      await tx.insert(bugReports).values({ id: reportId, betaModId, reporterId: session.userId,
        ...parsed.data, reproSteps: parsed.data.reproSteps || null });
      if (file && storedKey && heldId) {
        const [settled] = await tx.update(storageReservations).set({ state: "stored", settledAt: new Date() })
          .where(and(eq(storageReservations.id, heldId), eq(storageReservations.state, "held")))
          .returning({ id: storageReservations.id });
        if (!settled) throw new Error("Attachment storage reservation expired");
        await tx.insert(bugAttachments).values({ reportId, betaModId, uploaderId: session.userId,
          reservationId: heldId, objectKey: storedKey, filename: sanitizeFilename(file.name), sizeBytes: file.size });
      }
      await notifyUser(tx, mod.ownerId, session.userId, `New bug report: ${mod.title}`, `/mods/${betaModId}#report-${reportId}`);
    });
  } catch (error) {
    let committed = false;
    if (commitAttempted) {
      try {
        const [saved] = await db.select({ id: bugReports.id }).from(bugReports).where(eq(bugReports.id, reportId));
        committed = !!saved;
      } catch {
        if (reservationId) await retainReservationForCleanup(reservationId).catch(() => {});
        return { message: "The report result could not be confirmed. Reload this page before retrying; any attachment storage remains reserved until it can be checked." };
      }
    }
    if (!committed) {
      let removed = true;
      if (storageAttempted && finalKey) {
        try { await deleteStored(finalKey); } catch { removed = false; }
      }
      // A failed/aborted PUT may finish after cleanup's successful DELETE.
      // Only acknowledged storage followed by deletion proves safe release.
      if (reservationId && removed && (!storageAttempted || storageCompleted)) await releaseReservation(reservationId);
      else if (reservationId) await retainReservationForCleanup(reservationId);
      return { message: mutationMessage(error) };
    }
  } finally {
    if (quarantineKey) deleteQuarantine(quarantineKey);
  }
  refreshFeedback(betaModId);
  redirect(feedbackLocation(betaModId));
}

/** A vote is explicitly for the build the form displayed, never its successor. */
export async function voteReady(betaModId: string, displayedBuildId: string, isReady: boolean) {
  if (!db) redirect("/");
  const session = await verifySession();
  let errorMessage = await getAccountWriteError(session.userId);
  if (!errorMessage) {
    try {
      await db.transaction(tx => recordBuildVote(tx, { betaModId, displayedBuildId, testerId: session.userId, isReady }));
    } catch (error) { errorMessage = mutationMessage(error); }
  }
  if (!errorMessage) refreshFeedback(betaModId);
  redirect(`/mods/${betaModId}${errorMessage ? `?feedback=${encodeURIComponent(errorMessage)}` : ""}#testing`);
}

export async function respondToBugReport(formData: FormData) {
  if (!db) redirect("/");
  const session = await verifySession();
  const reportId = String(formData.get("reportId") ?? "");
  const [report] = await db.select().from(bugReports).where(eq(bugReports.id, reportId));
  if (!report) redirect("/dashboard");
  const parsed = AuthorResponseSchema.safeParse({ status: formData.get("status"), response: formData.get("response"), requestRetest: formData.get("requestRetest") === "on" });
  let errorMessage = await getAccountWriteError(session.userId);
  if (!parsed.success) errorMessage = "Choose a status and add a response of 5–2,000 characters.";
  if (!errorMessage && parsed.success) {
    try {
      await db.transaction(async tx => {
        assertEditableMod(await lockModForMutation(tx, report.betaModId), session.userId);
        await tx.update(bugReports).set({ status: parsed.data.status }).where(eq(bugReports.id, reportId));
        const [latest] = await tx.select({ id: builds.id }).from(builds).where(eq(builds.betaModId, report.betaModId))
          .orderBy(desc(builds.uploadedAt), desc(builds.id)).limit(1);
        const requestRetest = parsed.data.requestRetest || parsed.data.status === "fixed";
        const values = { authorResponse: parsed.data.response, respondedAt: new Date(),
          retestStatus: requestRetest ? "requested" : "not-requested", retestBuildId: requestRetest ? latest?.id ?? null : null, retestNotes: null, retestedAt: null };
        await tx.insert(bugReportWorkflow).values({ reportId, ...values })
          .onConflictDoUpdate({ target: bugReportWorkflow.reportId, set: values });
        await notifyUser(tx, report.reporterId, session.userId, "The author updated your bug report", `/mods/${report.betaModId}#report-${reportId}`);
        if (parsed.data.status === "fixed") await notifyModFollowers(tx, report.betaModId, session.userId, "A reported bug was marked fixed", `/mods/${report.betaModId}#report-${reportId}`);
      });
    } catch (error) { errorMessage = mutationMessage(error); }
  }
  if (!errorMessage) refreshFeedback(report.betaModId);
  redirect(feedbackLocation(report.betaModId, errorMessage ?? undefined));
}

export async function retestBugReport(formData: FormData) {
  if (!db) redirect("/");
  const session = await verifySession();
  const reportId = String(formData.get("reportId") ?? "");
  const [report] = await db.select().from(bugReports).where(eq(bugReports.id, reportId));
  if (!report) redirect("/dashboard");
  const parsed = RetestSchema.safeParse({ buildId: formData.get("buildId"), result: formData.get("result"), notes: formData.get("notes") });
  let errorMessage = await getAccountWriteError(session.userId);
  if (!parsed.success) errorMessage = "Choose a tested build and result; keep notes under 2,000 characters.";
  if (!errorMessage && parsed.success) {
    try {
      await db.transaction(async tx => {
        const mod = await lockModForMutation(tx, report.betaModId);
        assertEditableMod(mod);
        if (report.reporterId !== session.userId) throw new ModMutationError("Only the original reporter can record a retest.");
        const [build] = await tx.select({ id: builds.id }).from(builds)
          .where(and(eq(builds.id, parsed.data.buildId), eq(builds.betaModId, report.betaModId)));
        if (!build) throw new ModMutationError("Choose a build from this mod.");
        const values = { retestStatus: parsed.data.result, retestBuildId: parsed.data.buildId, retestNotes: parsed.data.notes || null, retestedAt: new Date() };
        await tx.insert(bugReportWorkflow).values({ reportId, ...values })
          .onConflictDoUpdate({ target: bugReportWorkflow.reportId, set: values });
        await tx.update(bugReports).set({ status: parsed.data.result === "still-present" ? "open" : "fixed" }).where(eq(bugReports.id, reportId));
        await notifyUser(tx, mod.ownerId, session.userId, "A tester recorded a bug retest", `/mods/${report.betaModId}#report-${reportId}`);
      });
    } catch (error) { errorMessage = mutationMessage(error); }
  }
  if (!errorMessage) refreshFeedback(report.betaModId);
  redirect(feedbackLocation(report.betaModId, errorMessage ?? undefined));
}

export async function deleteBugAttachment(formData: FormData) {
  if (!db) redirect("/");
  const session = await verifySession();
  const id = String(formData.get("attachmentId") ?? "");
  const [row] = await db.select({ attachment: bugAttachments, reporterId: bugReports.reporterId })
    .from(bugAttachments).innerJoin(bugReports, eq(bugReports.id, bugAttachments.reportId)).where(eq(bugAttachments.id, id));
  if (!row) redirect("/dashboard");
  let errorMessage = await getAccountWriteError(session.userId);
  if (!errorMessage) {
    try {
      await db.transaction(async tx => {
        const mod = await lockModForMutation(tx, row.attachment.betaModId);
        assertEditableMod(mod);
        if (session.userId !== mod.ownerId && session.userId !== row.reporterId) throw new ModMutationError("Only the reporter or mod author can remove an attachment.");
        await deleteStored(row.attachment.objectKey);
        await tx.delete(bugAttachments).where(eq(bugAttachments.id, id));
        await tx.delete(storageReservations).where(eq(storageReservations.id, row.attachment.reservationId));
      });
    } catch (error) { errorMessage = mutationMessage(error); }
  }
  if (!errorMessage) refreshFeedback(row.attachment.betaModId);
  redirect(feedbackLocation(row.attachment.betaModId, errorMessage ?? undefined));
}

// Compatibility for older rendered forms: new UI requires an author response.
export async function setBugReportStatus(bugReportId: string, _status: "open" | "acknowledged" | "fixed") {
  void _status;
  if (!db) redirect("/");
  const [report] = await db.select({ betaModId: bugReports.betaModId }).from(bugReports).where(eq(bugReports.id, bugReportId));
  redirect(report ? feedbackLocation(report.betaModId, "Reload the page and use the response form to update this report.") : "/dashboard");
}
