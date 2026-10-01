import {
  Bell,
  Bookmark,
  FileQuestion,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

const icons: Record<"notifications" | "following" | "missing" | "error", LucideIcon> = {
  notifications: Bell,
  following: Bookmark,
  missing: FileQuestion,
  error: TriangleAlert,
};

export default function EmptyStateArt({ kind }: { kind: keyof typeof icons }) {
  const Icon = icons[kind];

  return (
    <div aria-hidden="true" className="relative mb-6 h-20 w-24 text-accent-strong">
      <svg
        viewBox="0 0 96 80"
        fill="none"
        className="absolute inset-0 h-full w-full"
        focusable="false"
      >
        <path
          d="M8 24 48 4l40 20v32L48 76 8 56Z"
          stroke="currentColor"
          opacity=".16"
        />
        <path
          d="M8 24 48 44l40-20M48 44v32"
          stroke="currentColor"
          opacity=".12"
        />
        <path d="M1 40h10M85 40h10" stroke="currentColor" opacity=".4" />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <Icon className="h-8 w-8" strokeWidth={1.5} />
      </span>
    </div>
  );
}
