"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import type { AccountFormState } from "@lib/account-validation";

type Mode = "forgot" | "reset" | "change" | "verify" | "resend";
const labels: Record<Mode, string> = {
  forgot: "Send reset link", reset: "Reset password", change: "Change password",
  verify: "Verify email", resend: "Send verification email",
};

export default function AccountForm({ mode, action, token, disabled = false }: {
  mode: Mode;
  action: (state: AccountFormState, data: FormData) => Promise<AccountFormState>;
  token?: string;
  disabled?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, undefined);
  const prefix = useId();
  const fields: { name: "email" | "currentPassword" | "password" | "confirmPassword"; label: string; type: string; autoComplete: string }[] = [];
  if (mode === "forgot") fields.push({ name: "email", label: "Email address", type: "email", autoComplete: "email" });
  if (mode === "change") fields.push({ name: "currentPassword", label: "Current password", type: "password", autoComplete: "current-password" });
  if (mode === "change" || mode === "reset") fields.push(
    { name: "password", label: "New password", type: "password", autoComplete: "new-password" },
    { name: "confirmPassword", label: "Confirm new password", type: "password", autoComplete: "new-password" },
  );
  return (
    <form action={submit} className="space-y-4">
      {token && <input type="hidden" name="token" value={token} />}
      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={`${prefix}-${field.name}`} className="mb-1.5 block text-sm font-semibold text-[var(--text-soft)]">{field.label}</label>
          <input id={`${prefix}-${field.name}`} name={field.name} type={field.type} autoComplete={field.autoComplete}
            required maxLength={field.name === "email" ? 254 : 1024} className="field"
            aria-invalid={Boolean(state?.errors?.[field.name])}
            aria-describedby={state?.errors?.[field.name] ? `${prefix}-${field.name}-error` : undefined} />
          {state?.errors?.[field.name] && <p id={`${prefix}-${field.name}-error`} className="mt-1.5 text-sm text-rose-300">{state.errors[field.name]?.join(" ")}</p>}
        </div>
      ))}
      {(mode === "change" || mode === "reset") && <p className="text-xs text-[var(--muted)]">Use at least 12 characters. A few unrelated words work well. Changing your password signs out every device.</p>}
      {state?.message && <p role="status" aria-live="polite" className={`text-sm ${state.success ? "text-[var(--accent)]" : "text-rose-300"}`}>{state.message}</p>}
      {state?.success && mode === "verify" ? <Link href="/account" className="button-primary">Return to account</Link> : (
        <button type="submit" disabled={disabled || pending} className="button-primary">{pending ? "Please wait…" : labels[mode]}</button>
      )}
    </form>
  );
}
