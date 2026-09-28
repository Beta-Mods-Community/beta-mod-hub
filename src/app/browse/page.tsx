import Link from "next/link";
import { ArrowRight, CircleHelp, SearchX, SlidersHorizontal } from "lucide-react";

import GameFilter from "@/components/game-filter";
import ModCard from "@/components/mod-card";
import SortSelect from "@/components/sort-select";
import { getBrowseFeed, listBetaModGames } from "@lib/dal";

export const metadata = { title: "Browse active betas" };

type BrowseSearchParams = {
  game?: string | string[];
  sort?: string | string[];
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<BrowseSearchParams>;
}) {
  const params = await searchParams;
  const game = typeof params.game === "string" ? params.game : undefined;
  const requestedSort = typeof params.sort === "string" ? params.sort : undefined;
  const sortKey = requestedSort === "needs-testers" ? "needs-testers" : "newest";
  const [mods, games] = await Promise.all([
    getBrowseFeed(game || undefined, sortKey),
    listBetaModGames(),
  ]);

  return (
    <main className="flex-1 bg-zinc-950 text-zinc-100">
      <section className="border-b border-zinc-800/90 bg-zinc-900/30">
        <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 lg:px-8 lg:py-12">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.17em] text-cyan-300">
                <span>Mods</span><span className="text-zinc-700">/</span><span className="text-zinc-500">In testing</span>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">Browse beta mods</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
                Filter by game, download a test build, and report any problems you find.
              </p>
            </div>
            <Link
              href="/mods/new"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 lg:self-auto"
            >
              Post a beta <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section aria-label="Browse filters" className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-200">Filter and sort</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {mods.length} {mods.length === 1 ? "result" : "results"}{game ? ` for ${game}` : " across all games"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <GameFilter games={games} current={game} sort={sortKey} />
              <SortSelect current={sortKey} game={game} />
            </div>
          </div>
        </section>

        {sortKey === "needs-testers" && mods.length > 0 && (
          <div className="mt-5 flex gap-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <p className="leading-5">Showing the least-tested projects first, with older activity taking priority when tester counts match.</p>
          </div>
        )}

        {mods.length === 0 ? (
          <section className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/35 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500"><SearchX className="h-5 w-5" /></span>
            <h2 className="mt-5 text-lg font-semibold text-zinc-200">No active betas{game ? ` for ${game}` : " yet"}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
              {game ? "Choose another game or clear the filter to see all beta mods." : "Authors can create a mod page and upload a build for testing."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {game && (
                <Link
                  href={sortKey === "needs-testers" ? "/browse?sort=needs-testers" : "/browse"}
                  className="inline-flex h-10 items-center rounded-lg border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  Clear game filter
                </Link>
              )}
              <Link href="/mods/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200">
                Post a beta <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        ) : (
          <section aria-label="Active beta mods" className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-zinc-200">{sortKey === "needs-testers" ? "Fewest testers" : "Recently added"}</h2>
              <span className="text-xs tabular-nums text-zinc-500">{mods.length} {mods.length === 1 ? "project" : "projects"}</span>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {mods.map((mod) => <ModCard key={mod.id} mod={mod} />)}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
