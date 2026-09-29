import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { modFollows, notifications } from "../db/community-schema";

export type NotificationTx = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0];

export async function notifyUser(tx: NotificationTx, userId: string, actorId: string, title: string, href: string) {
  if (userId === actorId) return;
  await tx.insert(notifications).values({ userId, title: title.slice(0, 240), href });
}

export async function notifyModFollowers(tx: NotificationTx, modId: string, actorId: string, title: string, href: string) {
  const followers = await tx.select({ userId: modFollows.userId }).from(modFollows)
    .where(and(eq(modFollows.betaModId, modId), ne(modFollows.userId, actorId)));
  if (followers.length) await tx.insert(notifications).values(followers.map(({ userId }) => ({ userId, title: title.slice(0, 240), href })));
}

export async function getNotifications(userId: string) {
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(100);
}

export async function unreadCount(userId: string) {
  if (!db) return 0;
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return rows[0]?.count ?? 0;
}
