import { Archive, CircleHelp, ExternalLink, Flag, FlaskConical, TestTubeDiagonal, type LucideIcon } from "lucide-react";

import ContextHelp from "./context-help";

type StatusDefinition = {
  icon: LucideIcon;
  className: string;
  title: string;
  description: string;
};

const states = {
  alpha: {
    icon: FlaskConical,
    className: "border-amber-500/35 bg-amber-500/10 text-amber-200",
    title: "Alpha testing",
    description: "An early testing stage where features and behavior may change. Check the author's testing notes and report problems on the build you try.",
  },
  beta: {
    icon: TestTubeDiagonal,
    className: "border-accent/35 bg-accent-soft text-accent-strong",
    title: "Beta testing",
    description: "The mod is in beta testing. Check the latest build and testing notes, then report issues or record a readiness vote for the build you tested.",
  },
  rc: {
    icon: Flag,
    className: "border-violet-500/35 bg-violet-500/10 text-violet-200",
    title: "Release candidate",
    description: "The author is testing a potential release build. Test the listed build and report any remaining issues before voting on readiness.",
  },
  promoted: {
    icon: ExternalLink,
    className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
    title: "Released on Nexus",
    description: "The author has confirmed a live Nexus release. This beta page is read-only; use View live release to find the published mod.",
  },
  abandoned: {
    icon: Archive,
    className: "border-zinc-700 bg-zinc-900/80 text-zinc-400",
    title: "Abandoned beta",
    description: "The author has stopped active work on this beta. Check the listing for any notes before choosing a build to test.",
  },
} satisfies Record<string, StatusDefinition>;

export default function StatusBadge({ status, explain = true }: { status: string; explain?: boolean }) {
  const state = Object.hasOwn(states, status) ? states[status as keyof typeof states] : {
    icon: CircleHelp,
    className: "border-zinc-700 bg-zinc-900/80 text-zinc-400",
    title: "Unrecognized mod status",
    description: "This listing uses a status this view does not recognize. Check the listing details or ask the author about its current testing stage.",
  };
  const Icon = state.icon;
  const className = `inline-flex items-center gap-2 whitespace-nowrap min-h-8 rounded-md border px-2.5 py-1 text-sm font-semibold uppercase tracking-[0.06em] ${state.className}`;
  const content = <><Icon aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" strokeWidth={2} />{status}</>;
  if (!explain) return <span className={className}>{content}</span>;

  return (
    <ContextHelp title={state.title} description={state.description} label={`About ${status} status`} className={className}>
      {content}
    </ContextHelp>
  );
}
