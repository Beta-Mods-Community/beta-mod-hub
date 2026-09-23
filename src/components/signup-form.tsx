"use client";

import { useActionState } from "react";

import { signup } from "@lib/auth";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass =
  "mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const errorClass = "mt-1.5 text-sm text-red-600 dark:text-red-400";

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="displayName" className={labelClass}>
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          placeholder="How you'll appear on your mod pages"
          className={inputClass}
          autoComplete="name"
        />
        {state?.errors?.displayName && (
          <p className={errorClass}>{state.errors.displayName.join(", ")}</p>
        )}
      </div>

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
          placeholder="8+ chars, letters, numbers, a symbol"
          className={inputClass}
          autoComplete="new-password"
        />
        {state?.errors?.password && (
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm text-red-600 dark:text-red-400">
            {state.errors.password.map((error) => (
              <li key={error}>Password must {error.toLowerCase()}</li>
            ))}
          </ul>
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
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}