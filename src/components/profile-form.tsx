"use client";

import { useActionState, useId } from "react";

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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${prefix}-display-name`} className={labelClass}>
          Display name
        </label>
        <input
          id={`${prefix}-display-name`}
          name="displayName"
          type="text"
          defaultValue={initial?.displayName}
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
          defaultValue={initial?.bio}
          placeholder="Games you play, mods you make, or what you like testing."
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.bio)}
          aria-describedby={state?.errors?.bio ? `${prefix}-bio-error` : undefined}
        />
        {state?.errors?.bio && (
          <p id={`${prefix}-bio-error`} className={errorClass}>{state.errors.bio.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-avatar-url`} className={labelClass}>
          Avatar URL
        </label>
        <input
          id={`${prefix}-avatar-url`}
          name="avatarUrl"
          type="url"
          defaultValue={initial?.avatarUrl ?? ""}
          placeholder="https://example.com/avatar.png (optional)"
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.avatarUrl)}
          aria-describedby={state?.errors?.avatarUrl ? `${prefix}-avatar-url-error` : undefined}
        />
        {state?.errors?.avatarUrl && (
          <p id={`${prefix}-avatar-url-error`} className={errorClass}>{state.errors.avatarUrl.join(", ")}</p>
        )}
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-rose-300">{state.message}</p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="button-primary"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
