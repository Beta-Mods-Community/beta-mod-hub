"use client";

import { useActionState } from "react";

import { login } from "@lib/auth";

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          className={inputClass}
          autoComplete="email"
        />
        {state?.errors?.email && (
          <p className={errorClass}>{state.errors.email.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Your password"
          className={inputClass}
          autoComplete="current-password"
        />
        {state?.errors?.password && (
          <p className={errorClass}>{state.errors.password.join(", ")}</p>
        )}
      </div>

      {state?.message && (
        <p className="text-sm text-rose-300">{state.message}</p>
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
