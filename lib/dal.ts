import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";

import { db } from "./db";
import { decrypt } from "./session";
import { getViewer } from "./access";
import { emptyReputationHistory, type ReputationHistory } from "./reputation";
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
      bio: users.bio,
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
  hiddenAt: betaMods.hiddenAt,
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

  const mod = rows[0];
  if (mod?.hiddenAt) {
    const viewer = await getViewer();
    if (!viewer?.isAdmin && viewer?.userId !== mod.ownerId) return null;
  }
  return mod ?? null;
});

/** Mods a given user owns — dashboard "Building" tab and profile pages. */
export const getModsByOwner = cache(async (userId: string) => {
  if (!db) return [];
  const viewer = await getViewer();

  return db
    .select(betaModColumns)
    .from(betaMods)
    .leftJoin(users, eq(users.id, betaMods.ownerId))
    .where(and(eq(betaMods.ownerId, userId), viewer?.isAdmin || viewer?.userId === userId ? undefined : isNull(betaMods.hiddenAt)))
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
        isNull(betaMods.hiddenAt),
        game ? eq(betaMods.game, game) : undefined,
      ),
    )
    .orderBy(desc(betaMods.createdAt))
    .limit(200);
});

export const listBetaModGames = cache(async () => {
  if (!db) return [];

  const rows = await db.selectDistinct({ game: betaMods.game }).from(betaMods).where(and(isNull(betaMods.hiddenAt), notInArray(betaMods.status, ["promoted", "abandoned"])));
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

  const build = rows[0];
  if (build && !(await getBetaMod(build.betaModId))) return null;
  return build ?? null;
});

export const getBuildsByModId = cache(async (betaModId: string) => {
  if (!db) return [];

  return db
    .select(buildColumns)
    .from(builds)
    .where(eq(builds.betaModId, betaModId))
    .orderBy(desc(builds.uploadedAt), desc(builds.id));
});

export const getLatestBuildByModId = cache(async (betaModId: string) => {
  if (!db) return null;

  const rows = await db
    .select(buildColumns)
    .from(builds)
    .where(eq(builds.betaModId, betaModId))
    .orderBy(desc(builds.uploadedAt), desc(builds.id))
    .limit(1);

  return rows[0] ?? null;
});

async function getLatestBuildsByModIds(modIds: string[]) {
  const latest = new Map<
    string,
    { id: string; betaModId: string; versionLabel: string; uploadedAt: Date }
  >();
  if (!db || modIds.length === 0) return latest;

  const rows = await db
    .select({
      id: builds.id,
      betaModId: builds.betaModId,
      versionLabel: builds.versionLabel,
      uploadedAt: builds.uploadedAt,
    })
    .from(builds)
    .where(inArray(builds.betaModId, modIds))
    .orderBy(desc(builds.uploadedAt), desc(builds.id));

  for (const row of rows) {
    if (!latest.has(row.betaModId)) latest.set(row.betaModId, row);
  }
  return latest;
}

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
      reporterId: bugReports.reporterId,
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

  const latestBuild = await getLatestBuildByModId(betaModId);
  if (!latestBuild) return { ready: 0, total: 0 };

  const rows = await db
    .select({
      ready: sql<number>`count(*) filter (where ${readySignals.isReady})`,
      total: sql<number>`count(*)`,
    })
    .from(readySignals)
    .where(
      and(
        eq(readySignals.betaModId, betaModId),
        eq(readySignals.buildId, latestBuild.id),
      ),
    );

  const row = rows[0];
  return { ready: Number(row?.ready ?? 0), total: Number(row?.total ?? 0) };
});

export const getMyReadyVote = cache(async (betaModId: string, userId: string) => {
  if (!db) return null;

  const latestBuild = await getLatestBuildByModId(betaModId);
  if (!latestBuild) return null;

  const rows = await db
    .select({ isReady: readySignals.isReady })
    .from(readySignals)
    .where(
      and(
        eq(readySignals.betaModId, betaModId),
        eq(readySignals.buildId, latestBuild.id),
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

    const latestBuilds = await getLatestBuildsByModIds(modIds);
    const latestBuildIds = [...latestBuilds.values()].map((build) => build.id);
    const [bugs, votes] = await Promise.all([
      db
        .select({ betaModId: bugReports.betaModId, status: bugReports.status })
        .from(bugReports)
        .where(inArray(bugReports.betaModId, modIds)),
      latestBuildIds.length > 0
        ? db
            .select({
              betaModId: readySignals.betaModId,
              isReady: readySignals.isReady,
            })
            .from(readySignals)
            .where(inArray(readySignals.buildId, latestBuildIds))
        : Promise.resolve([]),
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
    const buildRows = await db
      .select({
        id: builds.id,
        betaModId: builds.betaModId,
        uploadedAt: builds.uploadedAt,
      })
      .from(builds)
      .where(inArray(builds.betaModId, ids))
      .orderBy(desc(builds.uploadedAt), desc(builds.id));

    const latestBuildIdByMod = new Map<string, string>();
    for (const build of buildRows) {
      if (!latestBuildIdByMod.has(build.betaModId)) {
        latestBuildIdByMod.set(build.betaModId, build.id);
      }
    }
    const latestBuildIds = [...latestBuildIdByMod.values()];
    const [votes, bugs] = await Promise.all([
      latestBuildIds.length > 0
        ? db
            .select({
              betaModId: readySignals.betaModId,
              testerId: readySignals.testerId,
              isReady: readySignals.isReady,
            })
            .from(readySignals)
            .where(inArray(readySignals.buildId, latestBuildIds))
        : Promise.resolve([]),
      db
        .select({ betaModId: bugReports.betaModId, status: bugReports.status })
        .from(bugReports)
        .where(inArray(bugReports.betaModId, ids)),
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

/**
 * Mods the user has voted on, with their most recent historical verdict and
 * the current-build tally. A caller can use `isCurrentBuild` to ask for a
 * retest instead of presenting an older verdict as current.
 */
export const getVotedModsByUser = cache(async (userId: string) => {
  if (!db) return [];

  const voteRows = await db
    .select({
      betaModId: readySignals.betaModId,
      buildId: readySignals.buildId,
      buildVersion: builds.versionLabel,
      isReady: readySignals.isReady,
      votedAt: readySignals.createdAt,
    })
    .from(readySignals)
    .leftJoin(builds, eq(builds.id, readySignals.buildId))
    .where(eq(readySignals.testerId, userId))
    .orderBy(desc(readySignals.createdAt));
  if (voteRows.length === 0) return [];

  const mostRecentVoteByMod = new Map<string, (typeof voteRows)[number]>();
  for (const vote of voteRows) {
    if (!mostRecentVoteByMod.has(vote.betaModId)) {
      mostRecentVoteByMod.set(vote.betaModId, vote);
    }
  }
  const votes = [...mostRecentVoteByMod.values()];

  const ids = votes.map((v) => v.betaModId);
  const [mods, summary, latestBuilds] = await Promise.all([
    db
      .select(betaModColumns)
      .from(betaMods)
      .leftJoin(users, eq(users.id, betaMods.ownerId))
      .where(inArray(betaMods.id, ids)),
    getFeedbackSummaryByModIds(ids),
    getLatestBuildsByModIds(ids),
  ]);

  return votes.flatMap((vote) => {
    const mod = mods.find((m) => m.id === vote.betaModId);
    if (!mod) return [];
    const s = summary.get(vote.betaModId);
    const latestBuild = latestBuilds.get(vote.betaModId);
    return [
      {
        ...mod,
        myVote: vote.isReady,
        votedAt: vote.votedAt,
        voteBuildVersion: vote.buildVersion,
        currentBuildVersion: latestBuild?.versionLabel ?? null,
        isCurrentBuild:
          vote.buildId !== null && vote.buildId === latestBuild?.id,
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
      buildVersion: builds.versionLabel,
    })
    .from(bugReports)
    .innerJoin(betaMods, eq(betaMods.id, bugReports.betaModId))
    .leftJoin(builds, eq(builds.id, bugReports.buildId))
    .where(eq(bugReports.reporterId, userId))
    .orderBy(desc(bugReports.createdAt))
    .limit(50);
});

// --- Profiles and reputation ---

/** Public profile fields — deliberately excludes email/password/keys. */
export const getUserProfile = cache(async (userId: string) => {
  if (!db) return null;

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      createdAt: users.createdAt,
      nexusUserId: users.nexusUserId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0] ?? null;
});

/**
 * Aggregates the raw ReadySignal + BugReport rows that feed a user's derived
 * reputation (see lib/reputation.ts). Returns the count shape the pure
 * scorer expects — caller computes the score/tier.
 */
export const getReputationHistory = cache(
  async (userId: string): Promise<ReputationHistory> => {
    if (!db) return emptyReputationHistory;

    const [votes, bugs] = await Promise.all([
      db
        .select({
          betaModId: readySignals.betaModId,
          isReady: readySignals.isReady,
        })
        .from(readySignals)
        .where(eq(readySignals.testerId, userId)),
      db
        .select({ severity: bugReports.severity })
        .from(bugReports)
        .where(eq(bugReports.reporterId, userId)),
    ]);

    const distinctMods = new Set(votes.map((v) => v.betaModId));
    const readyVotes = votes.filter((v) => v.isReady).length;
    const notReadyVotes = votes.length - readyVotes;
    const minorBugs = bugs.filter((b) => b.severity === "minor").length;
    const majorBugs = bugs.filter((b) => b.severity === "major").length;
    const blockingBugs = bugs.filter((b) => b.severity === "blocking").length;

    return {
      distinctModsTested: distinctMods.size,
      readyVotes,
      notReadyVotes,
      minorBugs,
      majorBugs,
      blockingBugs,
    };
  },
);

/**
 * Reputation history for a batch of users — powers per-reporter reputation
 * badges on mod pages without N+1 queries. Users with no activity get their
 * id in the map with an empty history, so callers don't need to guess.
 */
export const getReputationHistoryByUserIds = cache(
  async (userIds: string[]): Promise<Map<string, ReputationHistory>> => {
    const map = new Map<string, ReputationHistory>();
    if (!db || userIds.length === 0) return map;

    for (const id of userIds) map.set(id, emptyReputationHistory);

    const [votes, bugs] = await Promise.all([
      db
        .select({
          testerId: readySignals.testerId,
          betaModId: readySignals.betaModId,
          isReady: readySignals.isReady,
        })
        .from(readySignals)
        .where(inArray(readySignals.testerId, userIds)),
      db
        .select({
          reporterId: bugReports.reporterId,
          severity: bugReports.severity,
        })
        .from(bugReports)
        .where(inArray(bugReports.reporterId, userIds)),
    ]);

    const distinct = new Map<string, Set<string>>();
    const ready = new Map<string, number>();
    const notReady = new Map<string, number>();
    const minor = new Map<string, number>();
    const major = new Map<string, number>();
    const blocking = new Map<string, number>();

    const bump = (m: Map<string, number>, key: string) =>
      m.set(key, (m.get(key) ?? 0) + 1);

    for (const v of votes) {
      if (!distinct.has(v.testerId)) distinct.set(v.testerId, new Set());
      distinct.get(v.testerId)!.add(v.betaModId);
      if (v.isReady) bump(ready, v.testerId);
      else bump(notReady, v.testerId);
    }
    for (const b of bugs) {
      if (b.severity === "minor") bump(minor, b.reporterId);
      else if (b.severity === "major") bump(major, b.reporterId);
      else bump(blocking, b.reporterId);
    }

    for (const id of userIds) {
      map.set(id, {
        distinctModsTested: distinct.get(id)?.size ?? 0,
        readyVotes: ready.get(id) ?? 0,
        notReadyVotes: notReady.get(id) ?? 0,
        minorBugs: minor.get(id) ?? 0,
        majorBugs: major.get(id) ?? 0,
        blockingBugs: blocking.get(id) ?? 0,
      });
    }
    return map;
  },
);
