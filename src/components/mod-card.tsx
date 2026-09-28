import Link from "next/link";
import { ArrowUpRight, Bug, CheckCircle2, PackageOpen, Users } from "lucide-react";

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
};

export default function ModCard({ mod, className = "" }: { mod: ModCardData; className?: string }) {
  const shownTags = mod.tags.slice(0, 3);
  const remainingTagCount = mod.tags.length - shownTags.length;
  const createdAt = new Date(mod.createdAt);

  return (
    <Link
      href={`/mods/${mod.id}`}
      aria-label={`View ${mod.title}`}
      className={`group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${className}`}
    >
      <div className="relative">
        <ModArtwork title={mod.title} game={mod.game} className="aspect-[16/9]" />
        <div className="absolute left-4 top-4"><StatusBadge status={mod.status} /></div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="truncate text-cyan-300">{mod.game}</span>
          <time className="shrink-0 text-zinc-500" dateTime={createdAt.toISOString()}>{formatDate(createdAt)}</time>
        </div>
        <h2 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-zinc-50 transition-colors group-hover:text-cyan-100">{mod.title}</h2>
        <p className="mt-1 text-xs text-zinc-500">by {mod.ownerName ?? "Unknown author"}</p>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-400">
          {mod.description?.trim() || "No description provided."}
        </p>

        {shownTags.length > 0 && (
          <div className="mt-4 flex min-h-6 flex-wrap gap-1.5" aria-label="Tags">
            {shownTags.map((tag) => (
              <span key={tag} className="rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-0.5 text-[11px] text-zinc-400">{tag}</span>
            ))}
            {remainingTagCount > 0 && <span className="px-1 py-0.5 text-[11px] text-zinc-500">+{remainingTagCount}</span>}
          </div>
        )}

        <dl className="mt-5 grid grid-cols-3 border-y border-zinc-800/90 py-3">
          <div className="min-w-0 border-r border-zinc-800 pr-3">
            <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-zinc-500"><Users className="h-3 w-3" /> Testers</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{mod.testerCount}</dd>
          </div>
          <div className="min-w-0 border-r border-zinc-800 px-3">
            <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-zinc-500"><Bug className="h-3 w-3" /> Open</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{mod.openBugs}</dd>
          </div>
          <div className="min-w-0 pl-3">
            <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-zinc-500"><CheckCircle2 className="h-3 w-3" /> Ready</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{mod.total > 0 ? `${mod.ready}/${mod.total}` : "—"}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span className="flex min-w-0 items-center gap-1.5">
            <PackageOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {mod.buildCount === 0 ? "No build posted" : `${mod.buildCount} ${mod.buildCount === 1 ? "build" : "builds"} · latest ${formatDate(mod.lastBuildAt ?? mod.updatedAt)}`}
            </span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-cyan-300" />
        </div>
      </div>
    </Link>
  );
}
