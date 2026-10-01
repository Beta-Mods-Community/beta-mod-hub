"use client";

import { useActionState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { setUploads, type AdminFormState } from "@lib/admin";

const buttonPrimary = "button-primary";
const buttonDanger =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50";

/**
 * The pilot kill switch. Renders whichever action is currently NOT the state,
 * so there is no way to leave it in an ambiguous position.
 */
export default function UploadSwitchForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState<
    AdminFormState | undefined,
    FormData
  >(setUploads, undefined);

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={enabled ? buttonDanger : buttonPrimary}
      >
        {enabled ? (
          <ShieldAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
        ) : (
          <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
        )}
        {pending
          ? "Working…"
          : enabled
            ? "Disable new uploads"
            : "Re-enable uploads"}
      </button>
      {state?.message && (
        <p role="status" className="mt-2 text-sm text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}
