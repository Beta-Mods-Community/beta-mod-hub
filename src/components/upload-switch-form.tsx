"use client";

import { useActionState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { setUploads, type AdminFormState } from "@lib/admin";

const buttonPrimary =
  "inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-zinc-50 dark:text-zinc-950";
const buttonDanger =
  "inline-flex items-center gap-1.5 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-red-600";

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
          <ShieldAlert className="h-4 w-4" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        {pending
          ? "Working…"
          : enabled
            ? "Disable new uploads"
            : "Re-enable uploads"}
      </button>
      {state?.message && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {state.message}
        </p>
      )}
    </form>
  );
}
