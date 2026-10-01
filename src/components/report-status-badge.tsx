import { CircleCheck, CircleDot, CircleHelp, Eye, type LucideIcon } from "lucide-react";

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

export default function ReportStatusBadge({ status }: { status: string }) {
  const known = Object.hasOwn(icons, status);
  const Icon = known ? icons[status] : CircleHelp;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] ${
        known ? styles[status] : "text-zinc-400"
      }`}
    >
      <Icon aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0" strokeWidth={1.8} />
      {status}
    </span>
  );
}
