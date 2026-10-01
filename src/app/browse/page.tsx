import Link from "next/link";
import { SearchX } from "lucide-react";

import CatalogFilters from "@/components/catalog-filters";
import ModCard from "@/components/mod-card";
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
  const useWideCards = mods.length <= 2;

  return (
    <main className="site-container flex-1 py-10 sm:py-12">
      <header>
        <h1 className="page-title">Browse beta mods</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Find beta builds by game, name, or tag.
        </p>
      </header>

      <CatalogFilters
        key={`${q}:${game ?? ""}:${sortKey}`}
        q={q}
        game={game}
        sort={sortKey}
        games={games}
      />

      {(hasFilters || sortKey !== "newest") && (
        <ul aria-label="Applied filters" className="mt-4 flex flex-wrap gap-2 text-xs leading-5 text-text-soft">
          {q && <li className="max-w-full break-words rounded-md border border-line bg-surface px-2.5 py-1">Search: “{q}”</li>}
          {game && <li className="max-w-full break-words rounded-md border border-line bg-surface px-2.5 py-1">Game: {game}</li>}
          {sortKey === "needs-testers" && <li className="rounded-md border border-line bg-surface px-2.5 py-1">Sort: Needs testers</li>}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <p className="text-sm text-muted">
          <span className="font-semibold tabular-nums text-text">{total.toLocaleString()}</span>
          {" "}{total === 1 ? "beta mod" : "beta mods"}{hasFilters ? " found" : " available"}
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
            <h2 id="empty-catalog-heading" className="section-title">
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
          <div className={`grid gap-5 sm:gap-6 ${useWideCards ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {mods.map((mod) => <ModCard key={mod.id} mod={mod} featured={useWideCards} />)}
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
