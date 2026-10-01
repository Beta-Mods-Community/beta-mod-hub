"use client";

import { useActionState, useState, useId } from "react";
import { unstable_rethrow } from "next/navigation";

import { uploadBuild } from "@lib/build-uploads";
import type { BuildUploadFormState } from "@lib/definitions";
import { formatBytes } from "@lib/pilot";
import { BUILD_ARCHIVE_ACCEPT, validateBuildArchive } from "@lib/build-upload-policy";
import { BUILD_UPLOAD_UNCONFIRMED, recoverUploadAction } from "@/lib/upload-action-recovery";
import FormErrorSummary from "@/components/form-error-summary";
import UploadStatus from "@/components/upload-status";

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

// Client recovery requires hydration. The original Server Action still receives
// this FormData once; its authentication and successful redirects are preserved.
async function submitBuild(previous: BuildUploadFormState, data: FormData): Promise<BuildUploadFormState> {
  return recoverUploadAction(uploadBuild, previous, data, unstable_rethrow, { message: BUILD_UPLOAD_UNCONFIRMED });
}

/**
 * `maxBytes` is the effective per-file ceiling, resolved on the server from the
 * pilot limits and the absolute hard cap. It is passed in rather than read from
 * the environment here, so the number the user is shown is exactly the number
 * the server will enforce.
 */
export default function BuildUploadForm({
  betaModId,
  maxBytes,
  zipOnly = false,
}: {
  betaModId: string;
  maxBytes: number;
  zipOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(submitBuild, undefined);
  const prefix = useId();
  const [versionLabel, setVersionLabel] = useState("");
  const [changelog, setChangelog] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <form action={formAction} onSubmit={event => {
      if (pending) { event.preventDefault(); return; }
      const file = new FormData(event.currentTarget).get("file");
      const error = file instanceof File ? validateBuildArchive(file.name, file.size, maxBytes, zipOnly) : "Choose an archive.";
      setFileError(error);
      if (error) event.preventDefault();
    }} className="flex flex-col gap-4">
      <input type="hidden" name="betaModId" value={betaModId} />

      <div>
        <label htmlFor={`${prefix}-versionLabel`} className={labelClass}>
          Version label
        </label>
        <input
          id={`${prefix}-versionLabel`}
          name="versionLabel"
          type="text"
          placeholder="0.2.1"
          required
          maxLength={40}
          value={versionLabel}
          onChange={event => setVersionLabel(event.target.value)}
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.versionLabel)}
          aria-describedby={state?.errors?.versionLabel ? `${prefix}-versionLabel-error` : undefined}
        />
        {state?.errors?.versionLabel && (
          <p id={`${prefix}-versionLabel-error`} className={errorClass}>{state.errors.versionLabel.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-changelog`} className={labelClass}>
          Changelog
        </label>
        <textarea
          id={`${prefix}-changelog`}
          name="changelog"
          rows={3}
          placeholder="What changed in this build?"
          maxLength={5000}
          value={changelog}
          onChange={event => setChangelog(event.target.value)}
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.changelog)}
          aria-describedby={state?.errors?.changelog ? `${prefix}-changelog-error` : undefined}
        />
        {state?.errors?.changelog && (
          <p id={`${prefix}-changelog-error`} className={errorClass}>{state.errors.changelog.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor="build-file" className={labelClass}>
          Build file
        </label>
        <input id="build-file" name="file" type="file" required accept={zipOnly ? ".zip" : BUILD_ARCHIVE_ACCEPT} aria-invalid={Boolean(fileError)} aria-describedby={[`${prefix}-build-file-help`, fileError ? `${prefix}-build-file-error` : undefined].filter(Boolean).join(" ")} onChange={event => {
          const file = event.target.files?.[0];
          setFileError(file ? validateBuildArchive(file.name, file.size, maxBytes, zipOnly) : null);
        }} className={inputClass} />
        <p id={`${prefix}-build-file-help`} className="mt-1 text-xs text-[var(--muted)]">
          {zipOnly ? "ZIP only, no encrypted or nested archives; up to 32 MiB expanded and 256 entries" : "ZIP, 7z, RAR, TAR, or TAR.GZ"}; max {formatBytes(maxBytes)}. Scanned for malware before it&apos;s stored
          or shared.
        </p>
        {zipOnly && <p className="mt-1 text-xs text-[var(--muted)]">Files are sent privately to Transloadit for scanning. See our privacy notice before uploading confidential material.</p>}
      </div>

      {fileError && <p id={`${prefix}-build-file-error`} role="alert" className={errorClass}>{fileError}</p>}

      {!pending && (
        <FormErrorSummary message={state?.message} fields={[
          { id: `${prefix}-versionLabel`, label: "Version label", errors: state?.errors?.versionLabel },
          { id: `${prefix}-changelog`, label: "Changelog", errors: state?.errors?.changelog },
        ]}>
          <p>Your version and changelog are preserved.</p>
        </FormErrorSummary>
      )}

      <div>
        <button
          type="submit"
          disabled={pending || !!fileError}
          className="button-primary"
        >
          {pending ? "Upload in progress…" : "Upload build"}
        </button>
        <UploadStatus pending={pending} />
        {!pending && <p className="mt-1.5 text-xs text-[var(--muted)]">The build appears after its scan passes. If a field needs correcting, select the file again before submitting.</p>}
      </div>
    </form>
  );
}
