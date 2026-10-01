import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react";

const states = {
  requested: { icon: RotateCcw, label: "Retest requested", color: "text-accent-strong" },
  resolved: { icon: CircleCheck, label: "Reporter confirmed resolved", color: "text-emerald-300" },
  "still-present": { icon: CircleAlert, label: "Reporter says the issue remains", color: "text-amber-300" },
};

export default function RetestNotice({
  status,
  buildVersion,
  notes,
}: {
  status: string;
  buildVersion?: string;
  notes?: string | null;
}) {
  if (!Object.hasOwn(states, status)) return null;
  const { icon: Icon, label, color } = states[status as keyof typeof states];

  return (
    <div className="mt-4 flex items-start gap-2.5 rounded border border-[var(--line)] p-3 text-sm">
      <Icon aria-hidden="true" focusable="false" className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} strokeWidth={1.8} />
      <div className="min-w-0">
        <p className="break-words font-semibold">{label}</p>
        {buildVersion && <p className="mt-1 break-words text-xs text-[var(--muted)]">Build {buildVersion}</p>}
        {notes && <p className="mt-2 whitespace-pre-wrap break-words text-[var(--text-soft)]">{notes}</p>}
      </div>
    </div>
  );
}
