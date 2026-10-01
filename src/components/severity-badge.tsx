import { CircleHelp, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";

import ContextHelp from "./context-help";

type SeverityDefinition = {
  icon: LucideIcon;
  className: string;
  title: string;
  description: string;
};

const states = {
  minor: {
    icon: Info,
    className: "border-zinc-700 bg-zinc-800/70 text-zinc-300",
    title: "Minor severity",
    description: "A cosmetic or occasional problem. Include where it happens and the steps that help the author reproduce it.",
  },
  major: {
    icon: TriangleAlert,
    className: "border-amber-500/35 bg-amber-500/10 text-amber-200",
    title: "Major severity",
    description: "A feature is broken. Describe the affected feature, its impact, and the steps that reproduce the problem.",
  },
  blocking: {
    icon: OctagonAlert,
    className: "border-red-500/35 bg-red-500/10 text-red-200",
    title: "Blocking severity",
    description: "A problem that prevents playing or testing. Include the build tested and the steps that lead to the failure.",
  },
} satisfies Record<string, SeverityDefinition>;

export default function SeverityBadge({ severity }: { severity: string }) {
  const state = Object.hasOwn(states, severity) ? states[severity as keyof typeof states] : {
    icon: CircleHelp,
    className: states.minor.className,
    title: "Unrecognized severity",
    description: "This report uses a severity this view does not recognize. Read the report details to understand its impact on testing.",
  };
  const Icon = state.icon;
  return (
    <ContextHelp
      title={state.title}
      description={state.description}
      label={`About ${severity} severity`}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-1 text-xs font-semibold leading-4 ${state.className}`}
    >
      <Icon aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0" strokeWidth={1.8} />
      {severity}
    </ContextHelp>
  );
}
