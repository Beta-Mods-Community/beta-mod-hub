"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";

import GameFilter from "./game-filter";
import SortSelect from "./sort-select";

export default function CatalogFilters({ q, game, sort, games }: {
  q: string;
  game?: string;
  sort: string;
  games: string[];
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const activeCount = Number(Boolean(game)) + Number(sort === "needs-testers");

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    function syncLayout() {
      if (disclosure.current) disclosure.current.open = desktop.matches;
    }
    syncLayout();
    desktop.addEventListener("change", syncLayout);
    return () => desktop.removeEventListener("change", syncLayout);
  }, []);

  return (
    <form
      action="/browse"
      method="get"
      role="search"
      aria-label="Find beta mods"
      className="panel mt-7 grid items-end gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(14rem,1fr)_minmax(22rem,1.2fr)_auto]"
    >
      <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold text-muted">
        Search mods
        <input name="q" defaultValue={q} maxLength={100} placeholder="Name, game, or tag" className="field" type="search" />
      </label>
      <details ref={disclosure} className="group min-w-0 rounded-md border border-line lg:border-0">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-text-soft lg:group-open:hidden [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal aria-hidden="true" className="h-5 w-5 shrink-0 text-text-soft" />
          Game &amp; sort{activeCount > 0 && <span className="text-xs text-muted">({activeCount} applied)</span>}
          <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="grid gap-4 p-3 pt-1 sm:grid-cols-2 lg:p-0">
          <GameFilter games={games} current={game} />
          <SortSelect current={sort} />
        </div>
      </details>
      <button type="submit" className="button-secondary justify-self-end">
        <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
        Search
      </button>
    </form>
  );
}
