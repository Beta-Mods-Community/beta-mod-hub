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
      className="flex items-center gap-2"
      onSubmit={(e) => e.preventDefault()}
    >
      <label
        htmlFor="browse-sort"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        Sort
      </label>
      <select
        id="browse-sort"
        defaultValue={current === "needs-testers" ? "needs-testers" : "newest"}
        onChange={(e) => {
          const sort = e.target.value;
          const params = new URLSearchParams();
          if (game) params.set("game", game);
          if (sort !== "newest") params.set("sort", sort);
          const qs = params.toString();
          router.push(qs ? `/browse?${qs}` : "/browse");
        }}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
      >
        <option value="newest">Newest</option>
        <option value="needs-testers">Needs testers</option>
      </select>
    </form>
  );
}