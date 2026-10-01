function initials(value: string, fallback: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export default function ModArtwork({
  title,
  game,
  className = "",
}: {
  title: string;
  game: string;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={`relative isolate overflow-hidden bg-surface-soft ${className}`}>
      <svg className="absolute inset-0 h-full w-full text-accent/20" viewBox="0 0 560 350" fill="none" preserveAspectRatio="xMidYMid slice" focusable="false">
        <path d="M28 66V28h38m428 0h38v38M28 284v38h38m428 0h38v-38" stroke="currentColor" />
        <path d="M280 46v238M120 164h320" stroke="currentColor" strokeDasharray="3 9" opacity="0.5" />
        <path d="m148 182 132 70 132-70M148 162l132 70 132-70" stroke="currentColor" strokeWidth="1.5" />
        <path d="m148 140 132-70 132 70-132 70Z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" />
        <path d="m214 140 66-35 66 35-66 35Z" stroke="currentColor" />
        <path d="M148 140v42m264-42v42m-132 28v42" stroke="currentColor" />
      </svg>
      <div className="relative flex h-full items-end justify-between gap-4 p-5 sm:p-6">
        <span className="text-4xl font-semibold leading-none tracking-tight text-text-soft/45">
          {initials(title, initials(game, "BM"))}
        </span>
        <span className="text-right text-xs leading-5 text-muted">
          No screenshot yet
        </span>
      </div>
    </div>
  );
}
