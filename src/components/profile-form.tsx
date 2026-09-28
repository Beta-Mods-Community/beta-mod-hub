"use client";

import { useActionState } from "react";

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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="display-name" className={labelClass}>
          Display name
        </label>
        <input
          id="display-name"
          name="displayName"
          type="text"
          defaultValue={initial?.displayName}
          className={inputClass}
        />
        {state?.errors?.displayName && (
          <p className={errorClass}>{state.errors.displayName.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor="bio" className={labelClass}>
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={initial?.bio}
          placeholder="Short bio — who you are, what you test."
          className={inputClass}
        />
        {state?.errors?.bio && (
          <p className={errorClass}>{state.errors.bio.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor="avatar-url" className={labelClass}>
          Avatar URL
        </label>
        <input
          id="avatar-url"
          name="avatarUrl"
          type="url"
          defaultValue={initial?.avatarUrl ?? ""}
          placeholder="https://…/avatar.png (optional)"
          className={inputClass}
        />
        {state?.errors?.avatarUrl && (
          <p className={errorClass}>{state.errors.avatarUrl.join(", ")}</p>
        )}
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
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
