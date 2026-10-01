"use client";
import { useActionState } from "react";
import { reportContent } from "@lib/community";
export default function ReportContentForm({ modId }: { modId: string }) {
  const [state, action, pending] = useActionState(reportContent, undefined);
  return <details className="rounded-lg border border-line bg-surface-soft p-4 text-sm"><summary className="cursor-pointer font-medium text-text-soft">Report this listing</summary>
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="modId" value={modId}/>
      <label className="block font-semibold text-text-soft">What is the issue?<textarea name="reason" className="field mt-2 font-normal" rows={4} required minLength={10} maxLength={2000}/></label>
      <p className="text-sm leading-6 text-[var(--muted)]">For prohibited content, ownership disputes, or abuse. Use Bug reports for problems with the mod itself.</p>
      <div className="form-actions">
        <button className="button-secondary" disabled={pending}>{pending ? "Submitting…" : "Send report"}</button>
      </div>
      {state && <p role="status" className="notice">{state.message}</p>}
    </form>
  </details>;
}
