const styles: Record<string, string> = {
  alpha:
    "border-amber-500/35 bg-amber-500/10 text-amber-200",
  beta: "border-cyan-500/35 bg-cyan-500/10 text-cyan-200",
  rc: "border-violet-500/35 bg-violet-500/10 text-violet-200",
  promoted:
    "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
  abandoned:
    "border-zinc-700 bg-zinc-900/80 text-zinc-400",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${
        styles[status] ?? styles.alpha
      }`}
    >
      {status}
    </span>
  );
}
