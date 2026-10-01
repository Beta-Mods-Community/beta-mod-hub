import { Star } from "lucide-react";

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
      className="inline-flex items-center gap-2 whitespace-nowrap min-h-8 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 py-1 align-middle text-sm font-semibold text-[var(--text-soft)]"
    >
      <Star aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" strokeWidth={2} />
      {score}
    </ContextHelp>
  );
}
