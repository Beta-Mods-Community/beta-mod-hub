import Link from "next/link";
import { ArrowUpRight, PackageOpen } from "lucide-react";

import ModArtwork from "@/components/mod-artwork";
import StatusBadge from "@/components/status-badge";
import { formatDate } from "@lib/format";
import { modExcerpt } from "@lib/mod-excerpt";

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
  const activity = [
    mod.testerCount > 0 ? `${mod.testerCount} ${mod.testerCount === 1 ? "tester" : "testers"}` : null,
    mod.openBugs > 0 ? `${mod.openBugs} open ${mod.openBugs === 1 ? "bug" : "bugs"}` : null,
    mod.total > 0 ? `${mod.ready}/${mod.total} ready votes` : null,
  ].filter(Boolean);
  const excerpt = modExcerpt(mod.description);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const artworkClass = `aspect-[16/9] w-full ${featured ? "object-contain md:h-full md:aspect-auto" : "object-cover"}`;

  return (
    <Link
      href={`/mods/${mod.id}`}
      aria-label={`View ${mod.title}`}
      className={`group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-accent/50 hover:bg-surface-raised ${featured ? "md:grid md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" : ""} ${className}`}
    >
      <div className="relative overflow-hidden bg-surface-soft">
        {mod.heroMediaId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${mod.heroMediaId}`} alt={`${mod.title} screenshot`} loading="lazy" className={artworkClass} />
        ) : <ModArtwork title={mod.title} game={mod.game} className={artworkClass} />}
        <div className="absolute left-4 top-4 rounded-sm bg-background"><StatusBadge status={mod.status} /></div>
      </div>
      <div className={`flex min-w-0 flex-1 flex-col p-5 ${featured ? "lg:p-8" : ""}`}>
        <p className="text-xs font-medium text-accent">{mod.game}</p>
        <Heading className={`mt-2 break-words font-semibold leading-snug tracking-tight text-text transition-colors group-hover:text-accent-strong ${featured ? "text-xl lg:text-2xl" : "text-lg"}`}>{mod.title}</Heading>
        <p className="mt-1.5 text-xs text-muted">by {mod.ownerName ?? "Unknown author"}</p>
        <p className={`mt-4 min-h-12 text-sm leading-6 text-text-soft ${featured ? "line-clamp-3" : "line-clamp-2"}`}>
          {excerpt || "No description provided."}
        </p>

        {shownTags.length > 0 && (
          <div className="mt-4 flex min-h-6 flex-wrap gap-1.5" aria-label="Tags">
            {shownTags.map((tag) => (
              <span key={tag} className="rounded bg-surface-soft px-2 py-1 text-xs text-muted">{tag}</span>
            ))}
            {remainingTagCount > 0 && <span className="px-1 py-1 text-xs text-muted">+{remainingTagCount}</span>}
          </div>
        )}

        <div className="mt-auto pt-5">
          <div className="space-y-2 border-t border-line pt-4 text-xs leading-5 text-muted">
            <p className="tabular-nums">{activity.length > 0 ? activity.join(" · ") : "No readiness votes yet"}</p>
            <p className="flex min-w-0 items-start gap-1.5">
              <PackageOpen aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {mod.buildCount === 0 ? "No build posted" : `${mod.buildCount} ${mod.buildCount === 1 ? "build" : "builds"} · latest ${formatDate(mod.lastBuildAt ?? mod.updatedAt)}`}
              </span>
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong">
            View beta <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </span>
        </div>
      </div>
    </Link>
  );
}
