/**
 * Derives reputation from distinct mods tested, build-scoped verdicts and
 * bug reports. Scores are computed from history, not stored on the user.
 *
 * Not-ready verdicts carry more weight than ready verdicts; bug-report weight
 * depends on severity. After three distinct mods, testers with only ready
 * verdicts receive a reduced ready-vote weight. See beta-mod-hub-spec.md.
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
 * Round the derived score to one decimal place for display.
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

/** Display label for a derived reputation score. */
export function reputationTier(score: number): string {
  if (score <= 0) return "New Tester";
  if (score < 10) return "Active Tester";
  if (score < 20) return "Experienced Tester";
  return "Trusted Tester";
}
