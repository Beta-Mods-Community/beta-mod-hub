import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { readAdminUserIds } from "./pilot";
import { betaMods, users } from "../db/schema";
import { contentReports, moderationLog } from "../db/community-schema";
import { notifyUser } from "./notifications";

const MODERATION_TARGET_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hide/restore/resolve a mod listing. Returns false (no write) unless the
 * actor is a configured administrator — the security gate lives here, not only
 * in the action wrapper, so it is directly testable.
 */
export async function applyModeration(
  actorId: string,
  id: string,
  action: string,
  reason: string,
): Promise<boolean> {
  if (!db || !MODERATION_TARGET_RE.test(id) || !["hide", "restore", "resolve"].includes(action) || reason.trim().length < 5) return false;
  if (!readAdminUserIds().has(actorId.toLowerCase())) return false;
  await db.transaction(async tx => {
    const [mod] = await tx.select().from(betaMods).where(eq(betaMods.id, id)).for("update").limit(1);
    if (!mod) return;
    if (action !== "resolve") {
      await tx.update(betaMods).set({ hiddenAt: action === "hide" ? new Date() : null }).where(eq(betaMods.id, id));
      await notifyUser(tx, mod.ownerId, actorId, `${mod.title}: listing ${action === "hide" ? "hidden" : "restored"}. ${reason}`, `/mods/${id}`);
    }
    await tx.update(contentReports).set({ resolvedAt: new Date() }).where(eq(contentReports.betaModId, id));
    await tx.insert(moderationLog).values({ actorId, targetId: id, action, reason });
  });
  return true;
}

/**
 * Suspend or unsuspend an account, bumping session_version so every existing
 * session dies on the next validation. Returns false for non-admin actors,
 * malformed input, or attempts to suspend another configured admin.
 */
export async function setAccountSuspendedRecord(
  actorId: string,
  targetUserId: string,
  suspended: boolean,
  reason: string,
): Promise<boolean> {
  const admins = readAdminUserIds();
  if (!db || !MODERATION_TARGET_RE.test(targetUserId) || reason.trim().length < 5
      || !admins.has(actorId.toLowerCase()) || admins.has(targetUserId.toLowerCase())) return false;
  await db.transaction(async tx => {
    await tx.update(users).set({ suspendedAt: suspended ? new Date() : null, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, targetUserId));
    await tx.insert(moderationLog).values({ actorId, targetId: targetUserId, action: suspended ? "suspend" : "unsuspend", reason });
  });
  return true;
}