export default function GameFilter({
  games,
  current,
}: {
  games: string[];
  current?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-xs font-medium text-muted">
      Game
      <select
        id="game-filter"
        name="game"
        defaultValue={current ?? ""}
        className="field"
      >
        <option value="">All games</option>
        {current && !games.includes(current) && <option value={current}>{current}</option>}
        {games.map((game) => (
          <option key={game} value={game}>
            {game}
          </option>
        ))}
      </select>
    </label>
  );
}
