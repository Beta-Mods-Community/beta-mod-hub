"use client";

import { useActionState, useId } from "react";

import { approveUploader, type AdminFormState } from "@lib/admin";
import { UserPlus } from "lucide-react";

const inputClass = "field";
const errorClass = "mt-1 text-sm text-rose-300";

/** Approve an existing account for pilot uploads. */
export default function ApproveUploaderForm() {
  const prefix = useId();
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
          htmlFor={`${prefix}-approve-email`}
          className="mb-1.5 block text-sm font-medium text-text-soft"
        >
          Account email
        </label>
        <input
          id={`${prefix}-approve-email`}
          name="email"
          type="email"
          required
          placeholder="tester@example.com"
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.email)}
          aria-describedby={state?.errors?.email ? `${prefix}-email-error` : undefined}
        />
        {state?.errors?.email && (
          <p id={`${prefix}-email-error`} className={errorClass}>{state.errors.email.join(", ")}</p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <label
          htmlFor={`${prefix}-approve-note`}
          className="mb-1.5 block text-sm font-medium text-text-soft"
        >
          Note (optional)
        </label>
        <input
          id={`${prefix}-approve-note`}
          name="note"
          type="text"
          maxLength={200}
          placeholder="Skyrim combat tester"
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.note)}
          aria-describedby={state?.errors?.note ? `${prefix}-note-error` : undefined}
        />
        {state?.errors?.note && (
          <p id={`${prefix}-note-error`} className={errorClass}>{state.errors.note.join(", ")}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="button-primary"
      >
        <UserPlus aria-hidden="true" className="h-5 w-5 shrink-0" />
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
