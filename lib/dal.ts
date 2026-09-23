import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "./db";
import { decrypt } from "./session";
import { betaMods, bugReports, builds, readySignals, requirements, users } from "../db/schema";

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
  nexusUrl: betaMods.nexusUrl,
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

// --- Requirement data access (feeds the promotion package) ---

export const getRequirementsByModId = cache(async (betaModId: string) => {
  if (!db) return [];

  return db
    .select({
      id: requirements.id,
      nexusModName: requirements.nexusModName,
      nexusModUrl: requirements.nexusModUrl,
    })
    .from(requirements)
    .where(eq(requirements.betaModId, betaModId))
    .orderBy(desc(requirements.nexusModName));
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

// --- Browse feed + dashboard Testing tab ---

export type BrowseSort = "newest" | "needs-testers";

/**
 * Active betas for /browse with per-mod test activity attached:
 * tester count (distinct voters), open bug count, ready tally, and build
 * recency. "needs-testers" prioritizes the fewest testers, then the
 * longest-stale mod (oldest activity) — the mods most desperate for people.
 */
export const getBrowseFeed = cache(
  async (game?: string, sort: BrowseSort = "newest") => {
    if (!db) return [];

    const mods = await listActiveBetaMods(game);
    if (mods.length === 0) return [];

    const ids = mods.map((m) => m.id);
    const [votes, bugs, buildRows] = await Promise.all([
      db
        .select({
          betaModId: readySignals.betaModId,
          testerId: readySignals.testerId,
          isReady: readySignals.isReady,
        })
        .from(readySignals)
        .where(inArray(readySignals.betaModId, ids)),
      db
        .select({ betaModId: bugReports.betaModId, status: bugReports.status })
        .from(bugReports)
        .where(inArray(bugReports.betaModId, ids)),
      db
        .select({
          betaModId: builds.betaModId,
          uploadedAt: builds.uploadedAt,
        })
        .from(builds)
        .where(inArray(builds.betaModId, ids)),
    ]);

    const agg = new Map<
      string,
      {
        testerCount: number;
        openBugs: number;
        ready: number;
        total: number;
        buildCount: number;
        lastBuildAt: Date | null;
      }
    >();
    for (const id of ids) {
      agg.set(id, {
        testerCount: 0,
        openBugs: 0,
        ready: 0,
        total: 0,
        buildCount: 0,
        lastBuildAt: null,
      });
    }

    const testers = new Map<string, Set<string>>();
    for (const v of votes) {
      const entry = agg.get(v.betaModId);
      if (!entry) continue;
      entry.total++;
      if (v.isReady) entry.ready++;
      if (!testers.has(v.betaModId)) testers.set(v.betaModId, new Set());
      testers.get(v.betaModId)!.add(v.testerId);
    }
    for (const [modId, set] of testers) {
      const entry = agg.get(modId);
      if (entry) entry.testerCount = set.size;
    }
    for (const b of bugs) {
      const entry = agg.get(b.betaModId);
      if (entry && b.status === "open") entry.openBugs++;
    }
    for (const row of buildRows) {
      const entry = agg.get(row.betaModId);
      if (entry) {
        entry.buildCount++;
        if (!entry.lastBuildAt || row.uploadedAt > entry.lastBuildAt) {
          entry.lastBuildAt = row.uploadedAt;
        }
      }
    }

    const feed = mods.map((m) => ({ ...m, ...agg.get(m.id)! }));
    if (sort === "needs-testers") {
      feed.sort(
        (a, b) =>
          a.testerCount - b.testerCount ||
          a.updatedAt.getTime() - b.updatedAt.getTime(),
      );
    }
    return feed;
  },
);

/** Mods the user has voted on, with their vote and the current tally. */
export const getVotedModsByUser = cache(async (userId: string) => {
  if (!db) return [];

  const votes = await db
    .select({
      betaModId: readySignals.betaModId,
      isReady: readySignals.isReady,
      votedAt: readySignals.createdAt,
    })
    .from(readySignals)
    .where(eq(readySignals.testerId, userId))
    .orderBy(desc(readySignals.createdAt));
  if (votes.length === 0) return [];

  const ids = votes.map((v) => v.betaModId);
  const [mods, summary] = await Promise.all([
    db
      .select(betaModColumns)
      .from(betaMods)
      .leftJoin(users, eq(users.id, betaMods.ownerId))
      .where(inArray(betaMods.id, ids)),
    getFeedbackSummaryByModIds(ids),
  ]);

  return votes.flatMap((vote) => {
    const mod = mods.find((m) => m.id === vote.betaModId);
    if (!mod) return [];
    const s = summary.get(vote.betaModId);
    return [
      {
        ...mod,
        myVote: vote.isReady,
        votedAt: vote.votedAt,
        ready: s?.ready ?? 0,
        total: s?.total ?? 0,
        openBugs: s?.openBugs ?? 0,
      },
    ];
  });
});

/** Bug reports the user has filed, joined against their mods. */
export const getMyBugReports = cache(async (userId: string) => {
  if (!db) return [];

  return db
    .select({
      id: bugReports.id,
      severity: bugReports.severity,
      status: bugReports.status,
      description: bugReports.description,
      createdAt: bugReports.createdAt,
      betaModId: bugReports.betaModId,
      modTitle: betaMods.title,
    })
    .from(bugReports)
    .innerJoin(betaMods, eq(betaMods.id, bugReports.betaModId))
    .where(eq(bugReports.reporterId, userId))
    .orderBy(desc(bugReports.createdAt))
    .limit(50);
});