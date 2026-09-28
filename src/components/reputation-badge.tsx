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
      className="inline-flex items-center gap-1 rounded-sm border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2 py-0.5 align-middle text-[11px] font-semibold text-[var(--text-soft)]"
    >
      <span aria-hidden>★</span>
      {score}
    </span>
  );
}
