export default function SortSelect({
  current,
}: {
  current: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-xs font-medium text-muted">
      Sort by
      <select
        id="browse-sort"
        name="sort"
        defaultValue={current === "needs-testers" ? "needs-testers" : "newest"}
        className="field"
      >
        <option value="newest">Newest</option>
        <option value="needs-testers">Needs testers</option>
      </select>
    </label>
  );
}
