/**
 * Reputation scoring for testers (spec, Phase 4 "Polish").
 *
 * `reputation_score` is DERIVED from a tester's history — never stored raw.
 * The formula is deliberately skeptical of "always ready" voters: a tester
 * who votes ready on everything is rubber-stamping, and their ready votes
 * should carry almost no trust weight for an author deciding whether to ship.
 *
 * Inputs come from ReadySignal rows (one per mod tested) plus BugReport rows
 * the tester filed. Pure module — no imports — so it is unit-testable without
 * a database and reusable from both server components and server actions.
 *
 * Weighting reasoning:
 *  - Distinct mods tested — the volume of real testing. Every mod a tester
 *    engages with earns base credit.
 *  - Ready votes — a positive (but cheap) signal. Counted small.
 *  - Not-ready votes — the critical, hard signal. Counted larger than ready:
 *    saying "this is NOT ready" is how a beta actually improves.
 *  - Bug reports — structured, actionable feedback; weighted by severity so a
 *    blocking report (crash, save-corruption) is worth more than a minor nit.
 *  - Always-ready discount — once a tester has judged >= N mods and never once
 *    voted not-ready, their ready votes drop to a tiny fraction. The ceiling
 *    they can earn by rubber-stamping is far below what real critical testing
 *    earns, so the score stays meaningful to authors.
 */

export const REPUTATION = {
  perModTested: 2,
  readyVote: 1,
  /** Multiplier applied to ready votes when the tester is "always ready". */
  readyVoteAlwaysReadyFactor: 0.25,
  notReadyVote: 3,
  /** Minimum distinct mods judged before "always ready" is a judgment, not an accident. */
  alwaysReadyMinMods: 3,
  bug: {
    minor: 1,
    major: 2,
    blocking: 3,
  },
} as const;

export type ReputationHistory = {
  distinctModsTested: number;
  readyVotes: number;
  notReadyVotes: number;
  minorBugs: number;
  majorBugs: number;
  blockingBugs: number;
};

export const emptyReputationHistory: ReputationHistory = {
  distinctModsTested: 0,
  readyVotes: 0,
  notReadyVotes: 0,
  minorBugs: 0,
  majorBugs: 0,
  blockingBugs: 0,
};

/** A tester is "always ready" only once they've judged enough mods to show a
 * pattern, and has never once voted not-ready across that set. */
export function isAlwaysReady(history: ReputationHistory): boolean {
  return (
    history.distinctModsTested >= REPUTATION.alwaysReadyMinMods &&
    history.notReadyVotes === 0
  );
}

/**
 * The derived score. Keeps one decimal place so the always-ready discount is
 * visible without pretending the formula is laboratory-grade.
 */
export function computeReputation(history: ReputationHistory): number {
  const readyFactor = isAlwaysReady(history)
    ? REPUTATION.readyVoteAlwaysReadyFactor
    : 1;

  const raw =
    REPUTATION.perModTested * history.distinctModsTested +
    REPUTATION.readyVote * history.readyVotes * readyFactor +
    REPUTATION.notReadyVote * history.notReadyVotes +
    REPUTATION.bug.minor * history.minorBugs +
    REPUTATION.bug.major * history.majorBugs +
    REPUTATION.bug.blocking * history.blockingBugs;

  return Math.round(raw * 10) / 10;
}

/** Friendly tier label, mirroring how Nexus maps stats to vague-but-encouraging words. */
export function reputationTier(score: number): string {
  if (score <= 0) return "New Tester";
  if (score < 10) return "Active Tester";
  if (score < 20) return "Experienced Tester";
  return "Trusted Tester";
}