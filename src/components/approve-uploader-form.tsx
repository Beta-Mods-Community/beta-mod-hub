"use client";

import { useActionState } from "react";

import { approveUploader, type AdminFormState } from "@lib/admin";
import { UserPlus } from "lucide-react";

const inputClass = "field";
const errorClass = "mt-1 text-sm text-rose-300";

/** Invite a tester/mod to upload. Server-rendered page owns the form state. */
export default function ApproveUploaderForm() {
  const [state, formAction, pending] = useActionState<AdminFormState | undefined, FormData>(
    approveUploader,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor="approve-email"
          className="mb-1.5 block text-sm font-medium text-text-soft"
        >
          Account email
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
          className="mb-1.5 block text-sm font-medium text-text-soft"
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
        className="button-primary"
      >
        <UserPlus className="h-4 w-4" />
        {pending ? "Adding…" : "Approve"}
      </button>
      {state?.message && (
        <p role="status" className="w-full text-sm text-muted sm:col-span-3">
          {state.message}
        </p>
      )}
    </form>
  );
}
