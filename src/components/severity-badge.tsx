const styles: Record<string, string> = {
  minor:
    "border-zinc-700 bg-zinc-800/70 text-zinc-300",
  major:
    "border-amber-500/35 bg-amber-500/10 text-amber-200",
  blocking:
    "border-red-500/35 bg-red-500/10 text-red-200",
};

export default function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.11em] ${
        styles[severity] ?? styles.minor
      }`}
    >
      {severity}
    </span>
  );
}
