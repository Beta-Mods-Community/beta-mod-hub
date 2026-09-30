"use client";

import { useActionState, useState, useId } from "react";

import { submitBugReport } from "@lib/feedback";
import { ATTACHMENT_ACCEPT } from "@lib/feedback-policy";

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

export default function BugReportForm({
  betaModId,
  builds,
  cloudPilot = false,
}: {
  betaModId: string;
  builds: { id: string; versionLabel: string }[];
  cloudPilot?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    submitBugReport,
    undefined,
  );
  const prefix = useId();
  const [buildId, setBuildId] = useState(builds[0]?.id ?? "");
  const [severity, setSeverity] = useState("minor");
  const [description, setDescription] = useState("");
  const [reproSteps, setReproSteps] = useState("");

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
      <input type="hidden" name="betaModId" value={betaModId} />

      <div>
        <label htmlFor={`${prefix}-buildId`} className={labelClass}>
          Affected build
        </label>
        <select
          id={`${prefix}-buildId`}
          name="buildId"
          required
          value={buildId}
          onChange={event => setBuildId(event.target.value)}
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.buildId)}
          aria-describedby={state?.errors?.buildId ? `${prefix}-buildId-error` : undefined}
        >
          {builds.map((build, index) => (
            <option key={build.id} value={build.id}>
              {build.versionLabel}{index === 0 ? " (latest)" : ""}
            </option>
          ))}
        </select>
        {state?.errors?.buildId && (
          <p id={`${prefix}-buildId-error`} className={errorClass}>{state.errors.buildId.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-severity`} className={labelClass}>
          Severity
        </label>
        <select
          id={`${prefix}-severity`}
          name="severity"
          value={severity}
          onChange={event => setSeverity(event.target.value)}
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.severity)}
          aria-describedby={state?.errors?.severity ? `${prefix}-severity-error` : undefined}
        >
          <option value="minor">Minor — cosmetic or edge case</option>
          <option value="major">Major — broken feature or workaround-able</option>
          <option value="blocking">Blocking — can&apos;t play/test properly</option>
        </select>
        {state?.errors?.severity && (
          <p id={`${prefix}-severity-error`} className={errorClass}>{state.errors.severity.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-description`} className={labelClass}>
          What happened?
        </label>
        <textarea
          id={`${prefix}-description`}
          name="description"
          rows={4}
          required
          minLength={10}
          maxLength={4000}
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="What did you expect, and what actually happened?"
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.description)}
          aria-describedby={state?.errors?.description ? `${prefix}-description-error` : undefined}
        />
        {state?.errors?.description && (
          <p id={`${prefix}-description-error`} className={errorClass}>{state.errors.description.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-reproSteps`} className={labelClass}>
          Repro steps (optional)
        </label>
        <textarea
          id={`${prefix}-reproSteps`}
          name="reproSteps"
          rows={3}
          maxLength={2000}
          value={reproSteps}
          onChange={event => setReproSteps(event.target.value)}
          placeholder="1. Start a new save  2. Cast the spell  3. ..."
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.reproSteps)}
          aria-describedby={state?.errors?.reproSteps ? `${prefix}-reproSteps-error` : undefined}
        />
        {state?.errors?.reproSteps && (
          <p id={`${prefix}-reproSteps-error`} className={errorClass}>{state.errors.reproSteps.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-bug-attachment`} className={labelClass}>Log or save file (optional)</label>
        <input id={`${prefix}-bug-attachment`} name="attachment" type="file" accept={cloudPilot ? ".txt,.log,.json,.ini,.zip" : ATTACHMENT_ACCEPT} className={inputClass} />
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{cloudPilot ? "Plain UTF-8 text/log, JSON/INI or ZIP, up to 8 MiB. Binary saves are not supported yet. ZIPs cannot be encrypted or contain nested archives. Files are sent privately to Transloadit for scanning. " : "Text/log, ZIP, JSON/INI, or game saves (.sav, .save, .fos), up to 20 MiB. Scanned before storage. "}Only you and the mod author can download it. Remove passwords or personal details first.</p>
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-rose-300">{state.message} Your report text is preserved. Select an attachment again if you want to include it on retry.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="button-primary self-start"
      >
        {pending ? "Submitting and scanning attachment…" : "Report bug"}
      </button>
    </form>
  );
}
