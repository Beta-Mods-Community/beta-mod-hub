"use client";

import { useActionState, useId } from "react";

import { signup } from "@lib/auth";

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  const prefix = useId();

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${prefix}-displayName`} className={labelClass}>
          Display name
        </label>
        <input
          id={`${prefix}-displayName`}
          name="displayName"
          type="text"
          placeholder="How you'll appear on your mod pages"
          className={inputClass}
          autoComplete="name"
          aria-invalid={Boolean(state?.errors?.displayName)}
          aria-describedby={state?.errors?.displayName ? `${prefix}-displayName-error` : undefined}
        />
        {state?.errors?.displayName && (
          <p id={`${prefix}-displayName-error`} className={errorClass}>
            {state.errors.displayName.join(", ")}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-email`} className={labelClass}>
          Email
        </label>
        <input
          id={`${prefix}-email`}
          name="email"
          type="email"
          placeholder="you@example.com"
          className={inputClass}
          autoComplete="email"
          aria-invalid={Boolean(state?.errors?.email)}
          aria-describedby={state?.errors?.email ? `${prefix}-email-error` : undefined}
        />
        {state?.errors?.email && (
          <p id={`${prefix}-email-error`} className={errorClass}>
            {state.errors.email.join(", ")}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-password`} className={labelClass}>
          Password
        </label>
        <input
          id={`${prefix}-password`}
          name="password"
          type="password"
          placeholder="At least 12 characters"
          className={inputClass}
          autoComplete="new-password"
          aria-invalid={Boolean(state?.errors?.password)}
          aria-describedby={state?.errors?.password ? `${prefix}-password-error` : undefined}
        />
        {state?.errors?.password && (
          <ul id={`${prefix}-password-error`} className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm text-rose-300">
            {state.errors.password.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-rose-300">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="button-primary mt-2"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}