"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { formatUploadElapsed, uploadLongWaitMessage, uploadPendingMessage } from "@/lib/upload-status";

// Mounted only for one pending submission: a later submission gets a new clock.
// Elapsed time is observation, not a progress percentage or a claimed scan stage.
function PendingClock() {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <>
    <div className="flex items-center gap-2 text-[var(--text-soft)]">
      <LoaderCircle aria-hidden="true" size={15} className="animate-spin motion-reduce:animate-none" />
      <span role="timer" aria-live="off" className="tabular-nums">Elapsed {formatUploadElapsed(elapsedMs)}</span>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true">{uploadLongWaitMessage(elapsedMs)}</p>
  </>;
}

export default function UploadStatus({ pending, hasFile = true }: { pending: boolean; hasFile?: boolean }) {
  return <div className={pending ? "mt-2 space-y-2 text-xs leading-5 text-[var(--muted)]" : "sr-only"}>
    {/* Keep this region mounted; announce the pending message, not each tick. */}
    <p role="status" aria-live="polite" aria-atomic="true">{pending ? uploadPendingMessage(hasFile) : ""}</p>
    {pending && <PendingClock />}
  </div>;
}
