"use client";

import { useState } from "react";
import { releaseChecklist } from "@lib/help-content";

export default function ReleaseChecklist() {
  const [checked, setChecked] = useState<string[]>([]);
  return (
    <fieldset className="panel p-5 sm:p-6">
      <legend className="px-2 text-lg font-semibold text-text">Before you publish</legend>
      <p id="release-checklist-help" className="mb-4 text-sm leading-6 text-muted">For this page visit only. This does not approve a release, publish your mod, or change its status.</p>
      <div className="space-y-1">
        {releaseChecklist.map((item) => (
          <label key={item} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 text-sm leading-6 text-text-soft hover:bg-surface-raised">
            <input type="checkbox" checked={checked.includes(item)} onChange={(event) => {
              const isChecked = event.target.checked;
              setChecked((previous) => isChecked ? [...previous, item] : previous.filter((value) => value !== item));
            }} aria-describedby="release-checklist-help" className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
            <span>{item}</span>
          </label>
        ))}
      </div>
      <p role="status" className="mt-5 border-t border-line pt-4 text-sm font-medium text-accent-strong">{checked.length} of {releaseChecklist.length} checked</p>
    </fieldset>
  );
}
