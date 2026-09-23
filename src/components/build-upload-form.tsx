"use client";

import { useActionState } from "react";

import { uploadBuild } from "@lib/build-uploads";
import { MAX_UPLOAD_BYTES } from "@lib/definitions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass =
  "mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const errorClass = "mt-1.5 text-sm text-red-600 dark:text-red-400";

export default function BuildUploadForm({ betaModId }: { betaModId: string }) {
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
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Max {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Scanned for
          malware before it&apos;s stored or shared.
        </p>
      </div>

      {state?.message && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          {pending ? "Uploading…" : "Upload build"}
        </button>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          Files are quarantined and scanned before anything is stored —
          flagged files never make it out of quarantine.
        </p>
      </div>
    </form>
  );
}