import type { LucideIcon } from "lucide-react";

import ContextHelp from "./context-help";

export default function SectionHeading({
  title,
  description,
  icon: Icon,
  id,
  compact = false,
  className = "",
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  id?: string;
  compact?: boolean;
  className?: string;
}) {
  const icon = (
    <Icon
      aria-hidden="true"
      focusable="false"
      className={compact ? "h-5 w-5" : "h-6 w-6"}
      strokeWidth={2}
    />
  );
  const iconClassName = `grid ${compact ? "h-9 w-9" : "h-10 w-10"} shrink-0 place-items-center rounded-lg border border-accent/25 bg-linear-to-br from-accent/15 to-accent/5 text-accent-strong shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]`;

  return (
    <h2
      id={id}
      aria-label={description ? title : undefined}
      className={`flex items-center gap-3 font-semibold tracking-tight text-[var(--text)] ${compact ? "text-lg leading-snug" : "section-title"} ${className}`}
    >
      {description ? (
        <ContextHelp
          title={title}
          description={description}
          label={`About ${title}`}
          className={iconClassName}
        >
          {icon}
        </ContextHelp>
      ) : (
        <span className={iconClassName}>{icon}</span>
      )}
      <span>{title}</span>
    </h2>
  );
}
