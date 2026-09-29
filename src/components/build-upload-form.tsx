"use client";

import { useActionState, useState } from "react";

import { uploadBuild } from "@lib/build-uploads";
import { formatBytes } from "@lib/pilot";
import { BUILD_ARCHIVE_ACCEPT, validateBuildArchive } from "@lib/build-upload-policy";

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
  const [versionLabel, setVersionLabel] = useState("");
  const [changelog, setChangelog] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <form action={formAction} aria-busy={pending} onSubmit={event => {
      const file = new FormData(event.currentTarget).get("file");
      const error = file instanceof File ? validateBuildArchive(file.name, file.size, maxBytes) : "Choose an archive.";
      setFileError(error);
      if (error) event.preventDefault();
    }} className="flex flex-col gap-4">
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
          required
          maxLength={40}
          value={versionLabel}
          onChange={event => setVersionLabel(event.target.value)}
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
          maxLength={5000}
          value={changelog}
          onChange={event => setChangelog(event.target.value)}
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
        <input id="build-file" name="file" type="file" required accept={BUILD_ARCHIVE_ACCEPT} aria-describedby="build-file-help" onChange={event => {
          const file = event.target.files?.[0];
          setFileError(file ? validateBuildArchive(file.name, file.size, maxBytes) : null);
        }} className={inputClass} />
        <p id="build-file-help" className="mt-1 text-xs text-[var(--muted)]">
          ZIP, 7z, RAR, TAR, or TAR.GZ; max {formatBytes(maxBytes)}. Scanned for malware before it&apos;s stored
          or shared.
        </p>
      </div>

      {fileError && <p role="alert" className={errorClass}>{fileError}</p>}

      {state?.message && (
        <p role="alert" className="text-sm text-rose-300">{state.message} Your version and changelog are preserved. Select the file again to retry.</p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending || !!fileError}
          className="button-primary"
        >
          {pending ? "Uploading and scanning…" : "Upload build"}
        </button>
        <p role="status" className="mt-1.5 text-xs text-[var(--muted)]">
          {pending ? "Keep this page open. Uploading, malware scanning, and storage can take a few minutes for larger archives." : "The build appears on this page after the scan passes. If an upload fails, you can retry."}
        </p>
      </div>
    </form>
  );
}
