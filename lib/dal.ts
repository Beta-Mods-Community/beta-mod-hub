import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "./db";
import { decrypt } from "./session";
import { betaMods, bugReports, builds, readySignals, users } from "../db/schema";

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

// --- Build data access ---

const buildColumns = {
  id: builds.id,
  betaModId: builds.betaModId,
  versionLabel: builds.versionLabel,
  fileUrl: builds.fileUrl,
  changelog: builds.changelog,
  uploadedAt: builds.uploadedAt,
};

export const getBuildById = cache(async (id: string) => {
  if (!db) return null;

  const rows = await db
    .select(buildColumns)
    .from(builds)
    .where(eq(builds.id, id))
    .limit(1);

  return rows[0] ?? null;
});

export const getBuildsByModId = cache(async (betaModId: string) => {
  if (!db) return [];

  return db
    .select(buildColumns)
    .from(builds)
    .where(eq(builds.betaModId, betaModId))
    .orderBy(desc(builds.uploadedAt));
});

// --- Feedback data access (structured bug reports + ready votes) ---

export const getBugReportsByModId = cache(async (betaModId: string) => {
  if (!db) return [];

  return db
    .select({
      id: bugReports.id,
      severity: bugReports.severity,
      description: bugReports.description,
      reproSteps: bugReports.reproSteps,
      status: bugReports.status,
      createdAt: bugReports.createdAt,
      reporterName: users.displayName,
      buildVersion: builds.versionLabel,
    })
    .from(bugReports)
    .leftJoin(users, eq(users.id, bugReports.reporterId))
    .leftJoin(builds, eq(builds.id, bugReports.buildId))
    .where(eq(bugReports.betaModId, betaModId))
    .orderBy(desc(bugReports.createdAt));
});

export const getReadyTally = cache(async (betaModId: string) => {
  if (!db) return { ready: 0, total: 0 };

  const rows = await db
    .select({
      ready: sql<number>`count(*) filter (where ${readySignals.isReady})`,
      total: sql<number>`count(*)`,
    })
    .from(readySignals)
    .where(eq(readySignals.betaModId, betaModId));

  const row = rows[0];
  return { ready: Number(row?.ready ?? 0), total: Number(row?.total ?? 0) };
});

export const getMyReadyVote = cache(async (betaModId: string, userId: string) => {
  if (!db) return null;

  const rows = await db
    .select({ isReady: readySignals.isReady })
    .from(readySignals)
    .where(
      and(
        eq(readySignals.betaModId, betaModId),
        eq(readySignals.testerId, userId),
      ),
    )
    .limit(1);

  return rows[0]?.isReady ?? null;
});

/** Open-bug and ready-tally counts for a set of mods (dashboard Building tab). */
export const getFeedbackSummaryByModIds = cache(
  async (modIds: string[]) => {
    if (!db || modIds.length === 0) {
      return new Map<string, { openBugs: number; ready: number; total: number }>();
    }

    const [bugs, votes] = await Promise.all([
      db
        .select({ betaModId: bugReports.betaModId, status: bugReports.status })
        .from(bugReports)
        .where(inArray(bugReports.betaModId, modIds)),
      db
        .select({
          betaModId: readySignals.betaModId,
          isReady: readySignals.isReady,
        })
        .from(readySignals)
        .where(inArray(readySignals.betaModId, modIds)),
    ]);

    const summary = new Map<
      string,
      { openBugs: number; ready: number; total: number }
    >();
    for (const id of modIds) summary.set(id, { openBugs: 0, ready: 0, total: 0 });
    for (const bug of bugs) {
      const entry = summary.get(bug.betaModId);
      if (entry && bug.status === "open") entry.openBugs++;
    }
    for (const vote of votes) {
      const entry = summary.get(vote.betaModId);
      if (entry) {
        entry.total++;
        if (vote.isReady) entry.ready++;
      }
    }
    return summary;
  },
);