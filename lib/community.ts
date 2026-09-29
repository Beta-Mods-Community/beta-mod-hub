"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { verifySession } from "./dal";
import { getAccountWriteError } from "./access";
import { notifications } from "../db/community-schema";
import { setFollowRecord, reportContentRecord, MOD_ID_RE } from "./community-service";

export async function setFollow(modId: string, followed: boolean) {
  const { userId } = await verifySession();
  if (!db) return;
  if (!MOD_ID_RE.test(modId)) return;
  if (await getAccountWriteError(userId)) redirect("/account");
  await setFollowRecord(userId, modId, followed);
  revalidatePath(`/mods/${modId}`);
  revalidatePath("/following");
}

export async function markNotificationsRead() {
  const { userId } = await verifySession();
  if (db) await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  revalidatePath("/notifications");
}

export async function reportContent(_state: { message: string } | undefined, data: FormData) {
  const { userId } = await verifySession();
  const modId = String(data.get("modId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  const error = await getAccountWriteError(userId);
  if (error) return { message: error };
  return { message: await reportContentRecord(userId, modId, reason) };
}