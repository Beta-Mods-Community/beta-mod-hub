import { CircleHelp, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";

const styles: Record<string, string> = {
  minor:
    "border-zinc-700 bg-zinc-800/70 text-zinc-300",
  major:
    "border-amber-500/35 bg-amber-500/10 text-amber-200",
  blocking:
    "border-red-500/35 bg-red-500/10 text-red-200",
};

const icons: Record<string, LucideIcon> = {
  minor: Info,
  major: TriangleAlert,
  blocking: OctagonAlert,
};

export default function SeverityBadge({ severity }: { severity: string }) {
  const known = Object.hasOwn(icons, severity);
  const Icon = known ? icons[severity] : CircleHelp;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.11em] ${
        known ? styles[severity] : styles.minor
      }`}
    >
      <Icon aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0" strokeWidth={1.8} />
      {severity}
    </span>
  );
}
