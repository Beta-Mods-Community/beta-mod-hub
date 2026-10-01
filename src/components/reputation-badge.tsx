import { reputationTier } from "@lib/reputation";

import ContextHelp from "./context-help";

/** Compact participation score with an explanation of the tester's tier. */
export default function ReputationBadge({ score }: { score: number }) {
  const tier = reputationTier(score);
  return (
    <ContextHelp
      title={tier}
      description="Reputation is a participation score based on mods tested, readiness votes, and bug reports. Read the tester's history for context; the score does not verify report quality or trustworthiness."
      label={`About reputation ${score}, ${tier}`}
      className="inline-flex items-center gap-1 rounded-sm border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2 py-0.5 align-middle text-xs font-semibold text-[var(--text-soft)]"
    >
      <span aria-hidden>★</span>
      {score}
    </ContextHelp>
  );
}
