import Link from "next/link";
import { Search, SearchX } from "lucide-react";

import GameFilter from "@/components/game-filter";
import ModCard from "@/components/mod-card";
import SortSelect from "@/components/sort-select";
import { listBetaModGames } from "@lib/dal";
import { getCatalogPage } from "@lib/catalog";
import { browseUrl, catalogPage, CATALOG_PAGE_SIZE } from "@lib/catalog-query";

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
  const hasFilters = Boolean(game || q);
  const firstResult = (page - 1) * CATALOG_PAGE_SIZE + 1;
  const lastResult = firstResult + mods.length - 1;

  return (
    <main className="site-container flex-1 py-10 sm:py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-text">Browse beta mods</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Find beta builds by game, name, or tag.
        </p>
      </header>

      <form
        key={`${q}:${game ?? ""}:${sortKey}`}
        action="/browse"
        method="get"
        role="search"
        aria-label="Find beta mods"
        className="panel mt-7 grid items-end gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.65fr)_minmax(10rem,0.55fr)_auto]"
      >
        <label className="flex min-w-0 flex-col gap-2 text-xs font-medium text-muted">
          Search mods
          <input
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="Name, game, or tag"
            className="field"
            type="search"
          />
        </label>
        <GameFilter games={games} current={game} />
        <SortSelect current={sortKey} />
        <button type="submit" className="button-secondary">
          <Search className="h-4 w-4" aria-hidden="true" />
          Search
        </button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <p className="text-sm text-muted">
          <span className="font-semibold tabular-nums text-text">{total.toLocaleString()}</span>
          {" "}{total === 1 ? "beta" : "betas"}
          {game ? ` for ${game}` : " across all games"}
          {q && <> matching <span className="font-medium text-text">“{q}”</span></>}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted">
          {total > 0 && pages > 1 && (
            <span className="tabular-nums">Showing {firstResult}–{lastResult}</span>
          )}
          {(hasFilters || sortKey !== "newest") && (
            <Link href="/browse" className="font-medium text-text-soft underline underline-offset-4 hover:text-text">
              Reset filters
            </Link>
          )}
        </div>
      </div>

      {sortKey === "needs-testers" && mods.length > 0 && (
        <p className="mt-4 text-xs leading-5 text-muted">
          Fewest testers first. When counts match, mods with older activity come first.
        </p>
      )}

      {mods.length === 0 ? (
        <section className="flex items-start gap-4 py-10" aria-labelledby="empty-catalog-heading">
          <SearchX className="mt-1 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <div>
            <h2 id="empty-catalog-heading" className="text-base font-semibold text-text">
              {hasFilters ? "No matching beta mods" : "No active betas yet"}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
              {hasFilters
                ? "Try a different name, choose another game, or reset the filters to see all active betas."
                : "Beta mods will appear here when authors post them."}
            </p>
          </div>
        </section>
      ) : (
        <section aria-label="Active beta mods" className="mt-6">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {mods.map((mod) => <ModCard key={mod.id} mod={mod} />)}
          </div>
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-6">
              {page > 1 ? (
                <Link className="button-secondary" href={browseUrl({ q, game, sort: sortKey, page: page - 1 })}>
                  Previous
                </Link>
              ) : <span />}
              <span className="text-sm tabular-nums text-muted">Page {page} of {pages}</span>
              {page < pages ? (
                <Link className="button-secondary" href={browseUrl({ q, game, sort: sortKey, page: page + 1 })}>
                  Next
                </Link>
              ) : <span />}
            </nav>
          )}
        </section>
      )}
    </main>
  );
}
