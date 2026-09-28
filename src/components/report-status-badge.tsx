const styles: Record<string, string> = {
  open: "text-red-300",
  acknowledged: "text-amber-300",
  fixed: "text-emerald-300",
};

export default function ReportStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
        styles[status] ?? styles.open
      }`}
    >
      {status}
    </span>
  );
}
