"use client";

import { useTransition } from "react";

import { deleteBetaMod } from "@lib/beta-mods";

export default function DeleteModButton({ modId }: { modId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this beta mod permanently? This can't be undone.")) {
          startTransition(async () => {
            await deleteBetaMod(modId);
          });
        }
      }}
      className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 transition-colors hover:border-red-400 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-950/40"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}