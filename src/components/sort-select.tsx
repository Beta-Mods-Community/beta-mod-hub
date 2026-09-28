"use client";

import { useRouter } from "next/navigation";

export default function SortSelect({
  current,
  game,
}: {
  current: string;
  game?: string;
}) {
  const router = useRouter();

  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-initial"
      onSubmit={(e) => e.preventDefault()}
    >
      <label
        htmlFor="browse-sort"
        className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500"
      >
        Sort
      </label>
      <select
        id="browse-sort"
        value={current === "needs-testers" ? "needs-testers" : "newest"}
        onChange={(e) => {
          const sort = e.target.value;
          const params = new URLSearchParams();
          if (game) params.set("game", game);
          if (sort !== "newest") params.set("sort", sort);
          const qs = params.toString();
          router.push(qs ? `/browse?${qs}` : "/browse");
        }}
        className="h-10 min-w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition hover:border-zinc-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
      >
        <option value="newest">Newest</option>
        <option value="needs-testers">Needs testers</option>
      </select>
    </form>
  );
}
