"use client";

import { useRouter } from "next/navigation";

export default function GameFilter({
  games,
  current,
  sort,
}: {
  games: string[];
  current?: string;
  sort?: string;
}) {
  const router = useRouter();

  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-initial"
      onSubmit={(e) => e.preventDefault()}
    >
      <label
        htmlFor="game-filter"
        className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500"
      >
        Game
      </label>
      <select
        id="game-filter"
        value={current ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          const params = new URLSearchParams();
          if (value) params.set("game", value);
          if (sort === "needs-testers") params.set("sort", sort);
          const query = params.toString();
          router.push(query ? `/browse?${query}` : "/browse");
        }}
        className="h-10 min-w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition hover:border-zinc-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
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
