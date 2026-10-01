import { LockKeyhole, Paperclip } from "lucide-react";
import ContextHelp from "./context-help";

const fileTypes = new Set(["txt", "log", "zip", "sav", "save", "fos", "json", "ini"]);

export default function PrivateAttachmentLink({
  attachmentId,
  filename,
  sizeLabel,
}: {
  attachmentId: string;
  filename: string;
  sizeLabel: string;
}) {
  // A filename label, not content validation. Download authorization stays in the route.
  const extension = /^.+\.([^.]+)$/.exec(filename)?.[1].toLowerCase();
  const fileType = extension && fileTypes.has(extension) ? extension.toUpperCase() : "FILE";

  return (
    <div className="min-w-0 flex-1">
      <a
        href={`/attachments/${attachmentId}`}
        className="group flex items-start gap-2.5 rounded-sm text-sm text-accent-strong"
      >
        <Paperclip aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" strokeWidth={2} />
        <span className="min-w-0">
          <span className="break-all underline-offset-4 group-hover:underline">Download {filename}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <span className="rounded border border-[var(--line)] px-1.5 py-0.5 text-xs font-semibold tracking-wide">{fileType}</span>
            <span>{sizeLabel}</span>
          </span>
        </span>
      </a>
      <ContextHelp title="Private report attachment" description="Only the person who filed this report and the mod author can download this file. Other testers cannot see it. Use the filename link to download it, and avoid including passwords or other personal information in logs." className="mt-2 flex items-start gap-2 text-sm leading-5 text-[var(--muted)]">
        <LockKeyhole aria-hidden="true" focusable="false" className="mt-px h-4.5 w-4.5 shrink-0" strokeWidth={2} />
        <span>Reporter and mod author only</span>
      </ContextHelp>
    </div>
  );
}
