"use client";

import { useActionState } from "react";

import { uploadBuild } from "@lib/build-uploads";
import { formatBytes } from "@lib/pilot";

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

/**
 * `maxBytes` is the effective per-file ceiling, resolved on the server from the
 * pilot limits and the absolute hard cap. It is passed in rather than read from
 * the environment here, so the number the user is shown is exactly the number
 * the server will enforce.
 */
export default function BuildUploadForm({
  betaModId,
  maxBytes,
}: {
  betaModId: string;
  maxBytes: number;
}) {
  const [state, formAction, pending] = useActionState(uploadBuild, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="betaModId" value={betaModId} />

      <div>
        <label htmlFor="version-label" className={labelClass}>
          Version label
        </label>
        <input
          id="version-label"
          name="versionLabel"
          type="text"
          placeholder="0.2.1"
          className={inputClass}
        />
        {state?.errors?.versionLabel && (
          <p className={errorClass}>{state.errors.versionLabel.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor="changelog" className={labelClass}>
          Changelog
        </label>
        <textarea
          id="changelog"
          name="changelog"
          rows={3}
          placeholder="What changed in this build?"
          className={inputClass}
        />
        {state?.errors?.changelog && (
          <p className={errorClass}>{state.errors.changelog.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor="build-file" className={labelClass}>
          Build file
        </label>
        <input id="build-file" name="file" type="file" required className={inputClass} />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Max {formatBytes(maxBytes)}. Scanned for malware before it&apos;s stored
          or shared.
        </p>
      </div>

      {state?.message && (
        <p className="text-sm text-rose-300">{state.message}</p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="button-primary"
        >
          {pending ? "Uploading…" : "Upload build"}
        </button>
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Files are quarantined and scanned before anything is stored —
          flagged files never make it out of quarantine.
        </p>
      </div>
    </form>
  );
}
