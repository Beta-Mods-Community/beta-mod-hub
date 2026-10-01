import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react";

import ContextHelp from "./context-help";

/** A readiness vote always describes the particular build that was tested. */
export default function VerdictBadge({ isCurrentBuild, ready }: {
  isCurrentBuild: boolean;
  ready: boolean;
}) {
  const state = !isCurrentBuild ? {
    title: "Retest needed",
    description: "This vote applies to an earlier build and does not count toward the current build. Test the latest available build before submitting a new verdict.",
    icon: RotateCcw,
    color: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  } : ready ? {
    title: "Ready",
    description: "The tester marked the current build ready for release based on their testing. This is a verdict, not a guarantee of compatibility.",
    icon: CircleCheck,
    color: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
  } : {
    title: "Not ready",
    description: "The tester marked the current build as needing more work before release. A bug report can help the author understand what still needs fixing.",
    icon: CircleAlert,
    color: "border-red-500/35 bg-red-500/10 text-red-200",
  };
  const Icon = state.icon;

  return (
    <ContextHelp
      title={state.title}
      description={state.description}
      label={`About ${state.title.toLowerCase()} verdict`}
      className={`inline-flex items-center gap-2 whitespace-nowrap min-h-8 rounded-md border px-2.5 py-1 text-sm font-semibold uppercase tracking-[0.06em] ${state.color}`}
    >
      <Icon aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" strokeWidth={2} />
      {state.title}
    </ContextHelp>
  );
}
