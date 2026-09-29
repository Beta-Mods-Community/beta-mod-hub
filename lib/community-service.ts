import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { betaMods } from "../db/schema";
import { contentReports, modFollows } from "../db/community-schema";

export const MAX_FOLLOWS = 500;
export const MOD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Toggle a signed-in user's follow on a mod, serialized per user so the
 * follow cap cannot be raced past.
 *
 * Unfollowing deliberately stays available for a mod that was hidden *after*
 * it was followed: `hiddenAt` only blocks new follows. Otherwise a user whose
 * follows are all hidden is stuck, unable to clear their following list.
 */
export async function setFollowRecord(userId: string, modId: string, followed: boolean): Promise<void> {
  if (!db) return;
  if (!MOD_ID_RE.test(modId)) return;
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`follow:${userId}`}))`);
    const [mod] = await tx.select().from(betaMods).where(eq(betaMods.id, modId)).limit(1);
    if (!mod || (followed && mod.hiddenAt)) return;
    if (followed) {
      const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(modFollows).where(eq(modFollows.userId, userId));
      if (row.count >= MAX_FOLLOWS) return;
      await tx.insert(modFollows).values({ userId, betaModId: modId }).onConflictDoNothing();
    } else {
      await tx.delete(modFollows).where(and(eq(modFollows.userId, userId), eq(modFollows.betaModId, modId)));
    }
  });
}

/** Record a content report; returns the message shown on the form. */
export async function reportContentRecord(userId: string, modId: string, reason: string): Promise<string> {
  reason = reason.trim();
  if (!MOD_ID_RE.test(modId) || reason.length < 10 || reason.length > 2000)
    return "Describe the issue in 10–2,000 characters.";
  if (!db) return "Reporting is temporarily unavailable.";
  const [mod] = await db.select({ id: betaMods.id }).from(betaMods).where(eq(betaMods.id, modId)).limit(1);
  if (!mod) return "This mod could not be found.";
  await db.insert(contentReports).values({ betaModId: modId, reporterId: userId, reason }).onConflictDoNothing();
  return "Report submitted. The site administrator can review it.";
}