"use client";

import { useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteBugAttachment } from "@lib/feedback";

function RemovalButtons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return <div className="mt-3 flex flex-wrap gap-2">
    <button type="submit" disabled={pending} className="button-secondary text-xs text-rose-300">{pending ? "Removing attachment…" : "Confirm removal"}</button>
    <button type="button" disabled={pending} onClick={onCancel} className="button-secondary text-xs">Cancel</button>
  </div>;
}

export default function AttachmentRemoval({ attachmentId, filename }: { attachmentId: string; filename: string }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmationId = useId();
  const removeButton = useRef<HTMLButtonElement>(null);

  return <div className="min-w-0">
    <button ref={removeButton} type="button" onClick={() => setConfirmDelete(true)} aria-expanded={confirmDelete} aria-controls={confirmationId} className="text-xs text-[var(--muted)] hover:text-rose-300">Remove attachment</button>
    {confirmDelete && <form id={confirmationId} action={deleteBugAttachment} className="mt-2 rounded-md border border-[var(--line)] p-3">
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <p className="break-words text-sm">Remove <span className="font-semibold">{filename}</span>? This cannot be undone.</p>
      <RemovalButtons onCancel={() => { setConfirmDelete(false); removeButton.current?.focus(); }} />
    </form>}
  </div>;
}
