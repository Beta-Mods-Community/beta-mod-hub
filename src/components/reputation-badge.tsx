import { reputationTier } from "@lib/reputation";

/**
 * Compact reputation badge — score with tier as a tooltip. Shown next to
 * testers where authors decide who to trust (mod-page reporters), and at
 * the top of profile pages.
 */
export default function ReputationBadge({ score }: { score: number }) {
  return (
    <span
      title={`Reputation ${score} — ${reputationTier(score)}`}
      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 align-middle text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
    >
      <span aria-hidden>★</span>
      {score}
    </span>
  );
}