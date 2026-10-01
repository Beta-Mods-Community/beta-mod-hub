import type { LucideIcon } from "lucide-react";
import ContextHelp from "./context-help";

export default function SectionHeading({ title, description, icon: Icon, id, compact = false, className = "" }: {
  title: string;
  description?: string;
  icon: LucideIcon;
  id?: string;
  compact?: boolean;
  className?: string;
}) {
  const icon = <Icon aria-hidden="true" focusable="false" className="h-4 w-4" strokeWidth={1.8} />;
  const iconClassName = "grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/20 bg-accent-soft text-accent-strong";

  return <h2 id={id} aria-label={description ? title : undefined} className={`flex items-center gap-3 font-semibold tracking-tight text-[var(--text)] ${compact ? "text-lg" : "text-xl"} ${className}`}>
    {description ? <ContextHelp title={title} description={description} label={`About ${title}`} className={iconClassName}>{icon}</ContextHelp> : <span className={iconClassName}>{icon}</span>}
    <span>{title}</span>
  </h2>;
}
