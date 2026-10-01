"use client";

import { useState } from "react";
import { releaseChecklist } from "@lib/help-content";

export default function ReleaseReadinessChecklist() {
  const [checked, setChecked] = useState<string[]>([]);

  return (
    <fieldset className="mt-5 rounded-lg bg-surface-soft p-4 sm:p-5">
      <legend className="px-2 text-base font-semibold text-text">Release checklist</legend>
      <p id="release-readiness-help" className="mb-3 text-xs leading-5 text-muted">These checks are temporary and clear when you reload this page. They do not approve a release, publish your mod, or change its status.</p>
      <div className="space-y-1">
        {releaseChecklist.map((item) => (
          <label key={item} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 text-sm leading-6 text-text-soft hover:bg-surface-raised">
            <input type="checkbox" checked={checked.includes(item)} onChange={(event) => {
              const isChecked = event.target.checked;
              setChecked((previous) => isChecked ? [...previous, item] : previous.filter((value) => value !== item));
            }} aria-describedby="release-readiness-help" className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
            <span className="min-w-0">{item}</span>
          </label>
        ))}
      </div>
      <p role="status" className="mt-4 text-sm font-medium text-accent-strong">{checked.length} of {releaseChecklist.length} checked</p>
    </fieldset>
  );
}
