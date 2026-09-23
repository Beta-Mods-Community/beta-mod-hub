"use client";

import { useRouter } from "next/navigation";

export default function GameFilter({
  games,
  current,
}: {
  games: string[];
  current?: string;
}) {
  const router = useRouter();

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => e.preventDefault()}
    >
      <label
        htmlFor="game-filter"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        Game
      </label>
      <select
        id="game-filter"
        defaultValue={current ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          router.push(
            value ? `/browse?game=${encodeURIComponent(value)}` : "/browse",
          );
        }}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
      >
        <option value="">All games</option>
        {games.map((game) => (
          <option key={game} value={game}>
            {game}
          </option>
        ))}
      </select>
    </form>
  );
}