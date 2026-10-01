import { CircleCheck } from "lucide-react";
import { releaseChecklist } from "@lib/help-content";

export default function ReleaseChecklist() {
  return (
    <div className="panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-text">Before you publish</h2>
      <p className="mt-3 text-sm leading-6 text-muted">Review these points as you prepare your release.</p>
      <ul className="mt-4 space-y-3">
        {releaseChecklist.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm leading-6 text-text-soft">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/25 bg-linear-to-br from-accent/15 to-accent/5 text-accent-strong">
              <CircleCheck aria-hidden="true" focusable="false" className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="min-w-0 pt-1">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
