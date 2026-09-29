"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./access";
import { applyModeration, setAccountSuspendedRecord } from "./moderation-service";

export async function moderateContent(data: FormData) {
  const admin = await requireAdmin();
  const id = String(data.get("modId") ?? "");
  const action = String(data.get("decision") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  if (await applyModeration(admin.userId, id, action, reason)) revalidatePath("/", "layout");
}

export async function setAccountSuspended(data: FormData) {
  const admin = await requireAdmin();
  const userId = String(data.get("userId") ?? "").trim().toLowerCase();
  const suspended = data.get("suspended") === "true";
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  if (await setAccountSuspendedRecord(admin.userId, userId, suspended, reason)) revalidatePath("/admin");
}