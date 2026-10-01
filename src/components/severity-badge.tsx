import { CircleHelp, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";

import ContextHelp from "./context-help";

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

const descriptions: Record<string, string> = {
  minor: "A cosmetic or occasional problem. Include where it happens and the steps that help the author reproduce it.",
  major: "A feature is broken. Describe the affected feature, its impact, and the steps that reproduce the problem.",
  blocking: "A problem that prevents playing or testing. Include the build tested and the steps that lead to the failure.",
};

export default function SeverityBadge({ severity }: { severity: string }) {
  const known = Object.hasOwn(icons, severity);
  const Icon = known ? icons[severity] : CircleHelp;
  return (
    <ContextHelp
      title={known ? `${severity[0].toUpperCase()}${severity.slice(1)} severity` : "Unrecognized severity"}
      description={known ? descriptions[severity] : "This report uses a severity this view does not recognize. Read the report details to understand its impact on testing."}
      label={`About ${severity} severity`}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.11em] ${
        known ? styles[severity] : styles.minor
      }`}
    >
      <Icon aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0" strokeWidth={1.8} />
      {severity}
    </ContextHelp>
  );
}
