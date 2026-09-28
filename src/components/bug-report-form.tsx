"use client";

import { useActionState } from "react";

import { submitBugReport } from "@lib/feedback";

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

export default function BugReportForm({
  betaModId,
  builds,
}: {
  betaModId: string;
  builds: { id: string; versionLabel: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    submitBugReport,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="betaModId" value={betaModId} />

      <div>
        <label htmlFor="affected-build" className={labelClass}>
          Affected build
        </label>
        <select
          id="affected-build"
          name="buildId"
          required
          defaultValue={builds[0]?.id}
          className={inputClass}
        >
          {builds.map((build, index) => (
            <option key={build.id} value={build.id}>
              {build.versionLabel}{index === 0 ? " (latest)" : ""}
            </option>
          ))}
        </select>
        {state?.errors?.buildId && (
          <p className={errorClass}>{state.errors.buildId.join(", ")}</p>
        )}
      </div>

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
        <p className="text-sm text-rose-300">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="button-primary self-start"
      >
        {pending ? "Submitting…" : "Report bug"}
      </button>
    </form>
  );
}
