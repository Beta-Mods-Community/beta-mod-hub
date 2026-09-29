"use client";

import { useActionState, useId } from "react";

import { login } from "@lib/auth";

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const prefix = useId();

  return (
    <form action={action} className="flex flex-col gap-4">
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
          <p id={`${prefix}-email-error`} className={errorClass}>{state.errors.email.join(", ")}</p>
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
          placeholder="Your password"
          className={inputClass}
          autoComplete="current-password"
          aria-invalid={Boolean(state?.errors?.password)}
          aria-describedby={state?.errors?.password ? `${prefix}-password-error` : undefined}
        />
        {state?.errors?.password && (
          <p id={`${prefix}-password-error`} className={errorClass}>{state.errors.password.join(", ")}</p>
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
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}