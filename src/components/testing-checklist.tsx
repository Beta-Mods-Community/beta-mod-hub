"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ArrowUpRight } from "lucide-react";

export default function TestingChecklist({ versionLabel }: { versionLabel: string }) {
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);
  const items = [
    "Read the requirements and author's test notes",
    `Try build ${versionLabel} in game`,
    "Note your game version, setup and any issues",
  ];

  return <details className="group/checklist mt-6 border-t border-line pt-3">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-text marker:hidden [&::-webkit-details-marker]:hidden">
      Testing checklist
      <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-open/checklist:rotate-180" />
    </summary>
    <fieldset className="mt-3 space-y-2">
      <legend className="sr-only">Personal testing checklist for build {versionLabel}</legend>
      {items.map((item, index) => <label key={index} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm leading-6 text-text-soft transition-colors hover:bg-surface-raised">
        <input type="checkbox" checked={checked[index]} onChange={event => {
          const nextChecked = event.target.checked;
          setChecked(previous => previous.map((value, position) => position === index ? nextChecked : value));
        }} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
        <span className="min-w-0 break-words">{item}</span>
      </label>)}
    </fieldset>
    <p className="mt-4 text-xs leading-5 text-muted">For this page visit only. These checks do not submit a vote or report.</p>
    <div className="mt-1 flex flex-wrap gap-x-5">
      <Link href="/help/testing" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong hover:underline underline-offset-4">Testing guide</Link>
      <a href="#requirements" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[var(--accent-strong)] hover:underline underline-offset-4">Requirements <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></a>
      <a href="#bugs" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[var(--accent-strong)] hover:underline underline-offset-4">Bug reports <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></a>
    </div>
  </details>;
}
