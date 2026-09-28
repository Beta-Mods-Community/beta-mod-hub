"use client";

import { useActionState } from "react";

import { approveUploader, type AdminFormState } from "@lib/admin";
import { UserPlus } from "lucide-react";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
const errorClass = "mt-1 text-sm text-red-600 dark:text-red-400";

/** Invite a tester/mod to upload. Server-rendered page owns the form state. */
export default function ApproveUploaderForm() {
  const [state, formAction, pending] = useActionState<AdminFormState | undefined, FormData>(
    approveUploader,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="mt-5 flex flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-start dark:border-zinc-800"
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor="approve-email"
          className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Invite by email
        </label>
        <input
          id="approve-email"
          name="email"
          type="email"
          required
          placeholder="tester@example.com"
          className={inputClass}
        />
        {state?.errors?.email && (
          <p className={errorClass}>{state.errors.email.join(", ")}</p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <label
          htmlFor="approve-note"
          className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Note (optional)
        </label>
        <input
          id="approve-note"
          name="note"
          type="text"
          maxLength={200}
          placeholder="Skyrim combat tester"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-auto inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
      >
        <UserPlus className="h-4 w-4" />
        {pending ? "Adding…" : "Approve"}
      </button>
      {state?.message && (
        <p className="w-full text-sm text-zinc-600 sm:col-span-3 dark:text-zinc-400">
          {state.message}
        </p>
      )}
    </form>
  );
}
