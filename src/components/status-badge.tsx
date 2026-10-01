import { Archive, CircleHelp, ExternalLink, Flag, FlaskConical, TestTubeDiagonal, type LucideIcon } from "lucide-react";

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

export default function StatusBadge({ status }: { status: string }) {
  const known = Object.hasOwn(icons, status);
  const Icon = known ? icons[status] : CircleHelp;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.1em] ${
        known ? styles[status] : "border-zinc-700 bg-zinc-900/80 text-zinc-400"
      }`}
    >
      <Icon aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0" strokeWidth={1.8} />
      {status}
    </span>
  );
}
