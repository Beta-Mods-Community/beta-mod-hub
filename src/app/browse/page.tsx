import Link from "next/link";

import GameFilter from "@/components/game-filter";
import SortSelect from "@/components/sort-select";
import StatusBadge from "@/components/status-badge";
import { getBrowseFeed, listBetaModGames } from "@lib/dal";
import { formatDate } from "@lib/format";

export const metadata = { title: "Browse" };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; sort?: string }>;
}) {
  const { game, sort } = await searchParams;
  const sortKey = sort === "needs-testers" ? "needs-testers" : "newest";
  const [mods, games] = await Promise.all([
    getBrowseFeed(game || undefined, sortKey),
    listBetaModGames(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Browse active betas
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Beta mods looking for testers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <GameFilter games={games} current={game} />
          <SortSelect current={sortKey} game={game} />
        </div>
      </div>

      {sortKey === "needs-testers" && mods.length > 0 && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Sorted by fewest testers first, then longest without a new build —
          these are the betas that need you most.
        </p>
      )}

      {mods.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No active betas{game ? ` for ${game}` : ""} yet — be the first to{" "}
          <Link
            href="/mods/new"
            className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            post one
          </Link>
          .
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {mods.map((mod) => (
            <Link
              key={mod.id}
              href={`/mods/${mod.id}`}
              className="rounded-lg border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <div className="flex items-center justify-between gap-3">
                <StatusBadge status={mod.status} />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(mod.createdAt)}
                </span>
              </div>
              <h2 className="mt-3 text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {mod.title}
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {mod.game} · by {mod.ownerName ?? "unknown"}
              </p>

              <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                {mod.testerCount}{" "}
                {mod.testerCount === 1 ? "tester" : "testers"} ·{" "}
                {mod.openBugs} open{" "}
                {mod.openBugs === 1 ? "bug" : "bugs"} · {mod.ready}/{mod.total}{" "}
                ready
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {mod.buildCount === 0
                  ? "no builds yet"
                  : `${mod.buildCount} ${
                      mod.buildCount === 1 ? "build" : "builds"
                    } · last ${formatDate(
                      mod.lastBuildAt ?? mod.updatedAt,
                    )}`}
              </p>

              {mod.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {mod.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}