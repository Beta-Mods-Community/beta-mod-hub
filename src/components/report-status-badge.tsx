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
      className={`inline-flex items-center gap-1.5 whitespace-nowrap py-1 text-xs font-semibold leading-4 ${state.className}`}
    >
      <Icon aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0" strokeWidth={1.8} />
      {status}
    </ContextHelp>
  );
}
