import type { LucideIcon } from "lucide-react";

export default function SectionHeading({ title, icon: Icon, id, compact = false, className = "" }: {
  title: string;
  icon: LucideIcon;
  id?: string;
  compact?: boolean;
  className?: string;
}) {
  return <h2 id={id} className={`flex items-center gap-3 font-semibold tracking-tight text-[var(--text)] ${compact ? "text-lg" : "text-xl"} ${className}`}>
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/20 bg-accent-soft text-accent-strong">
      <Icon aria-hidden="true" focusable="false" className="h-4 w-4" strokeWidth={1.8} />
    </span>
    <span>{title}</span>
  </h2>;
}
