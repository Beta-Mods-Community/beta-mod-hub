import { Gamepad2 } from "lucide-react";

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
    <div aria-hidden="true" className={`relative isolate overflow-hidden bg-surface-raised ${className}`}>
      <div className="relative flex h-full min-h-36 flex-col justify-between p-5">
        <div className="flex items-center justify-end gap-2 text-xs text-muted">
          <Gamepad2 className="h-3.5 w-3.5" />
          {game}
        </div>
        <div className="flex items-end justify-between gap-4">
          <span className="text-5xl font-semibold leading-none tracking-tight text-text-soft/50">
            {initials(title, "BM")}
          </span>
          <span className="max-w-[55%] text-right text-xs leading-4 text-muted">
            No screenshots
          </span>
        </div>
      </div>
    </div>
  );
}
