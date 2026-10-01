import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react";
import ContextHelp from "./context-help";

const states = {
  requested: { icon: RotateCcw, label: "Retest requested", color: "text-accent-strong", help: "The author has asked the reporter to check the issue again. Download the named build, repeat the original steps, then use Record your retest to say whether it is resolved. Include any changes in your setup." },
  resolved: { icon: CircleCheck, label: "Reporter confirmed resolved", color: "text-emerald-300", help: "The reporter tested the stated build and could no longer reproduce the issue. This confirms that report, not every possible problem with the mod. If you still see it, file a report with your build and setup." },
  "still-present": { icon: CircleAlert, label: "Reporter says the issue remains", color: "text-amber-300", help: "The reporter tried the stated build and could still reproduce the issue. Read their retest notes for details. The author can respond with a fix or workaround and request another test." },
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
  const { icon: Icon, label, color, help } = states[status as keyof typeof states];

  return (
    <div className="mt-4 flex items-start gap-2.5 rounded border border-[var(--line)] p-3 text-sm">
      <div className="min-w-0">
        <ContextHelp title={label} description={help} className="flex items-start gap-2.5 font-semibold">
          <Icon aria-hidden="true" focusable="false" className={`h-5 w-5 shrink-0 ${color}`} strokeWidth={2} />
          <span className="break-words">{label}</span>
        </ContextHelp>
        {buildVersion && <p className="mt-1 break-words text-xs text-[var(--muted)]">Build {buildVersion}</p>}
        {notes && <p className="mt-2 whitespace-pre-wrap break-words text-[var(--text-soft)]">{notes}</p>}
      </div>
    </div>
  );
}
