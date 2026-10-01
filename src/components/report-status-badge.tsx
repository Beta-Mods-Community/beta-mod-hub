import { CircleCheck, CircleDot, CircleHelp, Eye, type LucideIcon } from "lucide-react";

import ContextHelp from "./context-help";

type ReportStatusDefinition = {
  icon: LucideIcon;
  className: string;
  title: string;
  description: string;
};

const states = {
  open: {
    icon: CircleDot,
    className: "text-red-300",
    title: "Open report",
    description: "This report is awaiting resolution. Check the report details and any author response for the latest information.",
  },
  acknowledged: {
    icon: Eye,
    className: "text-amber-300",
    title: "Acknowledged report",
    description: "The author has acknowledged this report. Check their response for context or a request for more information.",
  },
  fixed: {
    icon: CircleCheck,
    className: "text-emerald-300",
    title: "Fixed report",
    description: "The author has marked this issue fixed. The reporter can test the requested build and record whether the issue is resolved or still present.",
  },
} satisfies Record<string, ReportStatusDefinition>;

export default function ReportStatusBadge({ status }: { status: string }) {
  const state = Object.hasOwn(states, status) ? states[status as keyof typeof states] : {
    icon: CircleHelp,
    className: "text-zinc-400",
    title: "Unrecognized report status",
    description: "This report uses a status this view does not recognize. Read the author response and any retest details for context.",
  };
  const Icon = state.icon;
  return (
    <ContextHelp
      title={state.title}
      description={state.description}
      label={`About ${status} report status`}
      className={`inline-flex items-center gap-2 whitespace-nowrap min-h-8 py-1 text-sm font-semibold ${state.className}`}
    >
      <Icon aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" strokeWidth={2} />
      {status}
    </ContextHelp>
  );
}
