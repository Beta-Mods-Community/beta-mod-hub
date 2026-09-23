"use client";

import { useActionState } from "react";

import { submitBugReport } from "@lib/feedback";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass =
  "mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const errorClass = "mt-1.5 text-sm text-red-600 dark:text-red-400";

export default function BugReportForm({ betaModId }: { betaModId: string }) {
  const [state, formAction, pending] = useActionState(
    submitBugReport,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="betaModId" value={betaModId} />

      <div>
        <label htmlFor="severity" className={labelClass}>
          Severity
        </label>
        <select
          id="severity"
          name="severity"
          defaultValue="minor"
          className={inputClass}
        >
          <option value="minor">Minor — cosmetic or edge case</option>
          <option value="major">Major — broken feature or workaround-able</option>
          <option value="blocking">Blocking — can&apos;t play/test properly</option>
        </select>
        {state?.errors?.severity && (
          <p className={errorClass}>{state.errors.severity.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          What happened?
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="What did you expect, and what actually happened?"
          className={inputClass}
        />
        {state?.errors?.description && (
          <p className={errorClass}>{state.errors.description.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor="repro-steps" className={labelClass}>
          Repro steps (optional)
        </label>
        <textarea
          id="repro-steps"
          name="reproSteps"
          rows={3}
          placeholder="1. Start a new save  2. Cast the spell  3. ..."
          className={inputClass}
        />
        {state?.errors?.reproSteps && (
          <p className={errorClass}>{state.errors.reproSteps.join(", ")}</p>
        )}
      </div>

      {state?.message && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
      >
        {pending ? "Submitting…" : "Report bug"}
      </button>
    </form>
  );
}