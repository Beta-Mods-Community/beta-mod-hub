"use client";

import { useActionState } from "react";

import { login } from "@lib/auth";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass =
  "mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const errorClass = "mt-1.5 text-sm text-red-600 dark:text-red-400";

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
        <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}