"use client";

import { useActionState, useId, useState } from "react";

import type { ProfileFormState } from "@lib/definitions";

type ProfileFormAction = (
  state: ProfileFormState,
  formData: FormData,
) => Promise<ProfileFormState>;

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

export default function ProfileForm({
  action,
  initial,
}: {
  action: ProfileFormAction;
  initial?: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  };
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const prefix = useId();
  // Keep edits available for correction when the action returns an error.
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="form-section">
        <div>
          <label htmlFor={`${prefix}-display-name`} className={labelClass}>
            Display name
          </label>
          <input
            id={`${prefix}-display-name`}
            name="displayName"
            type="text"
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            className={inputClass}
            aria-invalid={Boolean(state?.errors?.displayName)}
            aria-describedby={state?.errors?.displayName ? `${prefix}-display-name-error` : undefined}
          />
          {state?.errors?.displayName && (
            <p id={`${prefix}-display-name-error`} className={errorClass}>{state.errors.displayName.join(", ")}</p>
          )}
        </div>

        <div>
          <label htmlFor={`${prefix}-bio`} className={labelClass}>
            Bio
          </label>
          <textarea
            id={`${prefix}-bio`}
            name="bio"
            rows={4}
            value={bio}
            onChange={event => setBio(event.target.value)}
            placeholder="Games you play, mods you make, or what you like testing."
            className={inputClass}
            aria-invalid={Boolean(state?.errors?.bio)}
            aria-describedby={state?.errors?.bio ? `${prefix}-bio-error` : undefined}
          />
          {state?.errors?.bio && (
            <p id={`${prefix}-bio-error`} className={errorClass}>{state.errors.bio.join(", ")}</p>
          )}
        </div>
      </div>

      <div className="min-w-0 border-t border-line pt-6">
        <label htmlFor={`${prefix}-avatar-url`} className={labelClass}>
          Avatar URL <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={`${prefix}-avatar-url`}
          name="avatarUrl"
          type="url"
          value={avatarUrl}
          onChange={event => setAvatarUrl(event.target.value)}
          placeholder="https://example.com/avatar.png"
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.avatarUrl)}
          aria-describedby={state?.errors?.avatarUrl ? `${prefix}-avatar-url-error` : undefined}
        />
        {state?.errors?.avatarUrl && (
          <p id={`${prefix}-avatar-url-error`} className={errorClass}>{state.errors.avatarUrl.join(", ")}</p>
        )}
      </div>

      {state?.message && (
        <p role="alert" className="notice notice-error">{state.message}</p>
      )}

      <div className="form-actions">
        <button
          type="submit"
          disabled={pending}
          className="button-primary w-full sm:w-auto"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
