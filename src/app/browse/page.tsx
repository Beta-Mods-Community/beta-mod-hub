import Link from "next/link";
import { ArrowRight, CircleHelp, SearchX, SlidersHorizontal } from "lucide-react";

import ModCard from "@/components/mod-card";
import { listBetaModGames } from "@lib/dal";
import { getCatalogPage } from "@lib/catalog";
import { browseUrl, catalogPage } from "@lib/catalog-query";

export const metadata = { title: "Browse active betas" };

type BrowseSearchParams = {
  game?: string | string[];
  sort?: string | string[];
  q?: string | string[];
  page?: string | string[];
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
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const [catalog, games] = await Promise.all([
    getCatalogPage({ game, q, sort: sortKey, page: catalogPage(params.page) }),
    listBetaModGames(),
  ]);
  const { mods, total, page, pages } = catalog;

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
                  {total} {total === 1 ? "result" : "results"}{game ? ` for ${game}` : " across all games"}
                </p>
              </div>
            </div>
            <form action="/browse" method="get" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(10rem,1fr)_10rem_10rem_auto]">
              <label className="text-xs text-zinc-400">Search<input name="q" defaultValue={q} maxLength={100} placeholder="Mod name, game, or tag" className="field mt-1" type="search" /></label>
              <label className="text-xs text-zinc-400">Game<select name="game" defaultValue={game ?? ""} className="field mt-1"><option value="">All games</option>{games.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="text-xs text-zinc-400">Sort<select name="sort" defaultValue={sortKey} className="field mt-1"><option value="newest">Newest</option><option value="needs-testers">Needs testers</option></select></label>
              <button className="button-secondary self-end">Search</button>
            </form>
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
            <h2 className="mt-5 text-lg font-semibold text-zinc-200">{q ? "No matching beta mods" : `No active betas${game ? ` for ${game}` : " yet"}`}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
              {game || q ? "Try another search or clear the filters to see all beta mods." : "Authors can create a mod page and upload a build for testing."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {(game || q) && (
                <Link
                  href={sortKey === "needs-testers" ? "/browse?sort=needs-testers" : "/browse"}
                  className="inline-flex h-10 items-center rounded-lg border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  Clear filters
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
              <span className="text-xs tabular-nums text-zinc-500">Page {page} of {pages}</span>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {mods.map((mod) => <ModCard key={mod.id} mod={mod} />)}
            </div>
            {pages > 1 && <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
              {page > 1 ? <Link className="button-secondary" href={browseUrl({ q, game, sort: sortKey, page: page - 1 })}>Previous</Link> : <span />}
              <span className="text-sm text-[var(--muted)]">Page {page} of {pages}</span>
              {page < pages ? <Link className="button-secondary" href={browseUrl({ q, game, sort: sortKey, page: page + 1 })}>Next</Link> : <span />}
            </nav>}
          </section>
        )}
      </div>
    </main>
  );
}
