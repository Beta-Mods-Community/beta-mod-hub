import { CircleCheck, CircleDot, CircleHelp, Eye, type LucideIcon } from "lucide-react";

import ContextHelp from "./context-help";

const styles: Record<string, string> = {
  open: "text-red-300",
  acknowledged: "text-amber-300",
  fixed: "text-emerald-300",
};

const icons: Record<string, LucideIcon> = {
  open: CircleDot,
  acknowledged: Eye,
  fixed: CircleCheck,
};

const descriptions: Record<string, string> = {
  open: "This report is awaiting resolution. Check the report details and any author response for the latest information.",
  acknowledged: "The author has acknowledged this report. Check their response for context or a request for more information.",
  fixed: "The author has marked this issue fixed. The reporter can test the requested build and record whether the issue is resolved or still present.",
};

export default function ReportStatusBadge({ status }: { status: string }) {
  const known = Object.hasOwn(icons, status);
  const Icon = known ? icons[status] : CircleHelp;
  return (
    <ContextHelp
      title={known ? `${status[0].toUpperCase()}${status.slice(1)} report` : "Unrecognized report status"}
      description={known ? descriptions[status] : "This report uses a status this view does not recognize. Read the author response and any retest details for context."}
      label={`About ${status} report status`}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] ${
        known ? styles[status] : "text-zinc-400"
      }`}
    >
      <Icon aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0" strokeWidth={1.8} />
      {status}
    </ContextHelp>
  );
}
