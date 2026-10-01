import { Archive, CircleHelp, ExternalLink, Flag, FlaskConical, TestTubeDiagonal, type LucideIcon } from "lucide-react";

import ContextHelp from "./context-help";

const styles: Record<string, string> = {
  alpha:
    "border-amber-500/35 bg-amber-500/10 text-amber-200",
  beta: "border-accent/35 bg-accent-soft text-accent-strong",
  rc: "border-violet-500/35 bg-violet-500/10 text-violet-200",
  promoted:
    "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
  abandoned:
    "border-zinc-700 bg-zinc-900/80 text-zinc-400",
};

const icons: Record<string, LucideIcon> = {
  alpha: FlaskConical,
  beta: TestTubeDiagonal,
  rc: Flag,
  promoted: ExternalLink,
  abandoned: Archive,
};

const explanations: Record<string, { title: string; description: string }> = {
  alpha: {
    title: "Alpha testing",
    description: "An early testing stage where features and behavior may change. Check the author's testing notes and report problems on the build you try.",
  },
  beta: {
    title: "Beta testing",
    description: "The mod is in beta testing. Check the latest build and testing notes, then report issues or record a readiness vote for the build you tested.",
  },
  rc: {
    title: "Release candidate",
    description: "The author is testing a potential release build. Test the listed build and report any remaining issues before voting on readiness.",
  },
  promoted: {
    title: "Released on Nexus",
    description: "The author has confirmed a live Nexus release. This beta page is read-only; use View live release to find the published mod.",
  },
  abandoned: {
    title: "Abandoned beta",
    description: "The author has stopped active work on this beta. Check the listing for any notes before choosing a build to test.",
  },
};

export default function StatusBadge({ status, explain = true }: { status: string; explain?: boolean }) {
  const known = Object.hasOwn(icons, status);
  const Icon = known ? icons[status] : CircleHelp;
  const className = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.1em] ${
    known ? styles[status] : "border-zinc-700 bg-zinc-900/80 text-zinc-400"
  }`;
  const content = <><Icon aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0" strokeWidth={1.8} />{status}</>;
  if (!explain) return <span className={className}>{content}</span>;

  const explanation = known ? explanations[status] : {
    title: "Unrecognized mod status",
    description: "This listing uses a status this view does not recognize. Check the listing details or ask the author about its current testing stage.",
  };
  return (
    <ContextHelp {...explanation} label={`About ${status} status`} className={className}>
      {content}
    </ContextHelp>
  );
}
