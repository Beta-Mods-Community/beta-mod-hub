import Link from "next/link";
import { ArrowUpRight, PackageOpen } from "lucide-react";

import ModArtwork from "@/components/mod-artwork";
import StatusBadge from "@/components/status-badge";
import { formatDate } from "@lib/format";

export type ModCardData = {
  id: string;
  title: string;
  description: string | null;
  game: string;
  tags: string[];
  status: string;
  ownerName: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  testerCount: number;
  openBugs: number;
  ready: number;
  total: number;
  buildCount: number;
  lastBuildAt: Date | string | null;
  heroMediaId?: string | null;
};

export default function ModCard({ mod, className = "", featured = false, headingLevel = 2 }: {
  mod: ModCardData;
  className?: string;
  featured?: boolean;
  headingLevel?: 2 | 3;
}) {
  const shownTags = mod.tags.slice(0, 3);
  const remainingTagCount = mod.tags.length - shownTags.length;
  const createdAt = new Date(mod.createdAt);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const artworkClass = `aspect-[16/9] w-full object-cover ${featured ? "md:h-full md:aspect-auto" : ""}`;

  return (
    <Link
      href={`/mods/${mod.id}`}
      aria-label={`View ${mod.title}`}
      className={`group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-accent/50 hover:bg-surface-raised ${featured ? "md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : ""} ${className}`}
    >
      <div className="relative overflow-hidden">
        {mod.heroMediaId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${mod.heroMediaId}`} alt={`${mod.title} screenshot`} loading="lazy" className={artworkClass} />
        ) : <ModArtwork title={mod.title} game={mod.game} className={artworkClass} />}
        <div className="absolute left-4 top-4"><StatusBadge status={mod.status} /></div>
      </div>
      <div className={`flex min-w-0 flex-1 flex-col p-5 ${featured ? "lg:p-8" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <span className="min-w-0 truncate font-medium text-accent">{mod.game}</span>
          <time className="shrink-0 text-muted" dateTime={createdAt.toISOString()}>{formatDate(createdAt)}</time>
        </div>
        <Heading className={`mt-3 break-words font-semibold leading-snug tracking-tight text-text transition-colors group-hover:text-accent-strong ${featured ? "text-xl lg:text-2xl" : "text-lg"}`}>{mod.title}</Heading>
        <p className="mt-1 text-xs text-muted">by {mod.ownerName ?? "Unknown author"}</p>
        <p className={`mt-3 min-h-10 text-sm leading-6 text-text-soft ${featured ? "line-clamp-3" : "line-clamp-2"}`}>
          {mod.description?.trim() || "No description provided."}
        </p>

        {shownTags.length > 0 && (
          <div className="mt-4 flex min-h-6 flex-wrap gap-1.5" aria-label="Tags">
            {shownTags.map((tag) => (
              <span key={tag} className="rounded border border-line bg-surface-soft px-2 py-0.5 text-[11px] text-muted">{tag}</span>
            ))}
            {remainingTagCount > 0 && <span className="px-1 py-0.5 text-[11px] text-muted">+{remainingTagCount}</span>}
          </div>
        )}

        <div className="mt-auto pt-5">
          <dl className="grid grid-cols-3 border-y border-line py-3">
            <div className="min-w-0 border-r border-line pr-2">
              <dt className="text-[11px] text-muted">Testers</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-text">{mod.testerCount}</dd>
            </div>
            <div className="min-w-0 border-r border-line px-2">
              <dt className="text-[11px] text-muted">Open bugs</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-text">{mod.openBugs}</dd>
            </div>
            <div className="min-w-0 pl-2">
              <dt className="text-[11px] text-muted">Ready votes</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-text">{mod.total > 0 ? `${mod.ready}/${mod.total}` : <span className="text-xs font-normal text-muted">No votes</span>}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
            <span className="flex min-w-0 items-center gap-1.5">
              <PackageOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {mod.buildCount === 0 ? "No build posted" : `${mod.buildCount} ${mod.buildCount === 1 ? "build" : "builds"} · latest ${formatDate(mod.lastBuildAt ?? mod.updatedAt)}`}
              </span>
            </span>
            <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-accent" />
          </div>
        </div>
      </div>
    </Link>
  );
}
