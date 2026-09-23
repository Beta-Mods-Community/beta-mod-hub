const styles: Record<string, string> = {
  open: "text-red-600 dark:text-red-400",
  acknowledged: "text-amber-600 dark:text-amber-400",
  fixed: "text-emerald-600 dark:text-emerald-400",
};

export default function ReportStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs font-medium uppercase tracking-wide ${
        styles[status] ?? styles.open
      }`}
    >
      {status}
    </span>
  );
}