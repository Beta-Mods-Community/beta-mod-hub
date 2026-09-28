"use client";

import { useActionState } from "react";

import { signup } from "@lib/auth";

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

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
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm text-rose-300">
            {state.errors.password.map((error) => (
              <li key={error}>Password must {error.toLowerCase()}</li>
            ))}
          </ul>
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
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
