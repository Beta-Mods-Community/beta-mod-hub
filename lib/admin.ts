"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import * as z from "zod";

import { requireAdmin } from "./access";
import { db } from "./db";
import { readPilotLimits } from "./pilot";
import { countPilotAccounts, setUploadsEnabled } from "./storage-usage";
import { pilotAccounts, users } from "../db/schema";

/**
 * Admin actions for the pilot: the upload kill switch and the upload
 * allowlist. Every one re-checks admin rights server-side — hiding a button
 * in the UI is not authorisation.
 */

export type AdminFormState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<"email" | "note", string[]>>;
};

const ApproveSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Enter a valid email address." })),
  note: z.string().trim().max(200).optional(),
});

/** Stop or resume all new uploads immediately. Existing files are untouched. */
export async function setUploads(
  _state: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const enabled = formData.get("enabled") === "true";

  await setUploadsEnabled(enabled);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/mods/[id]", "page");

  return {
    ok: true,
    message: enabled
      ? "Uploads are open again."
      : "New uploads are disabled. Existing builds still download.",
  };
}

/** Invite a tester/mod to upload while PILOT_MODE is on. */
export async function approveUploader(
  _state: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (!db) return { message: "The database isn't configured yet." };

  const parsed = ApproveSchema.safeParse({
    email: formData.get("email"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors as {
        email?: string[];
        note?: string[];
      },
    };
  }
  const { email, note } = parsed.data;

  const found = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = found[0];
  if (!user) {
    return {
      message: `No account for ${email} yet — they have to sign up on the site first.`,
    };
  }

  const existing = await db
    .select({ userId: pilotAccounts.userId })
    .from(pilotAccounts)
    .where(eq(pilotAccounts.userId, user.id))
    .limit(1);
  if (existing.length > 0) {
    return { message: `${user.displayName} already has upload access.` };
  }

  // The invite list is a hard cap during the pilot, so how many people can
  // ever upload is bounded by configuration rather than by memory.
  const limits = readPilotLimits();
  const approved = await countPilotAccounts();
  if (approved >= limits.maxApprovedUploaders) {
    return {
      message: `The pilot allows ${limits.maxApprovedUploaders} approved uploaders and ${approved} are approved already. Raise PILOT_MAX_UPLOADERS first.`,
    };
  }

  await db.insert(pilotAccounts).values({
    userId: user.id,
    approvedBy: admin.email ?? admin.userId,
    note: note || null,
  });

  revalidatePath("/admin");
  return { ok: true, message: `${user.displayName} can now upload.` };
}

export async function revokeUploader(userId: string): Promise<void> {
  await requireAdmin();
  if (!db) return;

  await db.delete(pilotAccounts).where(eq(pilotAccounts.userId, userId));
  revalidatePath("/admin");
}
