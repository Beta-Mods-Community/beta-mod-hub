"use client";
import { useActionState } from "react";
import { reportContent } from "@lib/community";
export default function ReportContentForm({ modId }: { modId: string }) {
  const [state, action, pending] = useActionState(reportContent, undefined);
  return <details className="panel p-4 text-sm"><summary className="cursor-pointer">Report this listing</summary>
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="modId" value={modId}/>
      <label className="block">What is the issue?<textarea name="reason" className="field mt-2" rows={4} required minLength={10} maxLength={2000}/></label>
      <p className="text-xs text-[var(--muted)]">For prohibited content, ownership disputes, or abuse. Use Bug reports for problems with the mod itself.</p>
      <button className="button-secondary" disabled={pending}>{pending ? "Submitting…" : "Send report"}</button>
      {state && <p role="status">{state.message}</p>}
    </form>
  </details>;
}
