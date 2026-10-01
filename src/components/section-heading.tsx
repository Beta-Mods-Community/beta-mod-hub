export default function SectionHeading({ title, id, className = "" }: {
  title: string;
  id?: string;
  className?: string;
}) {
  return <h2 id={id} className={`flex items-center gap-3 text-xl font-semibold tracking-tight text-[var(--text)] ${className}`}>
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 16" className="h-4 w-6 shrink-0 text-[var(--accent)]/65" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M0 8h6m12 0h6M12 3l5 5-5 5-5-5Z" />
    </svg>
    <span>{title}</span>
  </h2>;
}
