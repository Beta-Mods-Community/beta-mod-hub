import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, notInArray } from "drizzle-orm";

import { db } from "./db";
import { decrypt } from "./session";
import { betaMods, users } from "../db/schema";

/**
 * Data Access Layer — centralizes auth checks and user data access, per the
 * Next.js 16 auth guide. `cache()` memoizes within a single render pass so
 * the session cookie isn't decrypted repeatedly.
 */

export const verifySession = cache(async () => {
  const cookie = (await cookies()).get("session")?.value;
  const session = await decrypt(cookie);

  if (!session?.userId) {
    redirect("/login");
  }

  return { isAuth: true, userId: session.userId };
});

export const getUser = cache(async () => {
  const session = await verifySession();

  if (!db) return null;

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return rows[0] ?? null;
});

// --- BetaMod data access ---

const betaModColumns = {
  id: betaMods.id,
  title: betaMods.title,
  description: betaMods.description,
  game: betaMods.game,
  tags: betaMods.tags,
  status: betaMods.status,
  createdAt: betaMods.createdAt,
  updatedAt: betaMods.updatedAt,
  ownerId: betaMods.ownerId,
  ownerName: users.displayName,
};

export const getBetaMod = cache(async (id: string) => {
  if (!db) return null;

  const rows = await db
    .select(betaModColumns)
    .from(betaMods)
    .leftJoin(users, eq(users.id, betaMods.ownerId))
    .where(eq(betaMods.id, id))
    .limit(1);

  return rows[0] ?? null;
});

export const getOwnBetaMods = cache(async (userId: string) => {
  if (!db) return [];

  return db
    .select(betaModColumns)
    .from(betaMods)
    .leftJoin(users, eq(users.id, betaMods.ownerId))
    .where(eq(betaMods.ownerId, userId))
    .orderBy(desc(betaMods.updatedAt));
});

export const listActiveBetaMods = cache(async (game?: string) => {
  if (!db) return [];

  return db
    .select(betaModColumns)
    .from(betaMods)
    .leftJoin(users, eq(users.id, betaMods.ownerId))
    .where(
      and(
        notInArray(betaMods.status, ["promoted", "abandoned"]),
        game ? eq(betaMods.game, game) : undefined,
      ),
    )
    .orderBy(desc(betaMods.createdAt))
    .limit(200);
});

export const listBetaModGames = cache(async () => {
  if (!db) return [];

  const rows = await db.selectDistinct({ game: betaMods.game }).from(betaMods);
  return rows
    .map((row) => row.game)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
});