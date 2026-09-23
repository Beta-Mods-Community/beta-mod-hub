import Link from "next/link";

import GameFilter from "@/components/game-filter";
import StatusBadge from "@/components/status-badge";
import { listActiveBetaMods, listBetaModGames } from "@lib/dal";
import { formatDate } from "@lib/format";

export const metadata = { title: "Browse" };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  const [mods, games] = await Promise.all([
    listActiveBetaMods(game || undefined),
    listBetaModGames(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Browse active betas
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Beta mods looking for testers.
      </p>

      <div className="mb-8 mt-6">
        <GameFilter games={games} current={game} />
      </div>

      {mods.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
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
        <div className="grid gap-4 sm:grid-cols-2">
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