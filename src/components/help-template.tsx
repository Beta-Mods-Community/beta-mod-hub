"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import type { HelpTemplate as Template } from "@lib/help-content";

export default function HelpTemplate({ template }: { template: Template }) {
  const prefix = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(template.markdown);
      setCopied(true);
      setMessage("Copied. Paste it into your description and replace the bracketed notes.");
    } catch {
      field.current?.focus();
      field.current?.select();
      setCopied(false);
      setMessage("Copy was unavailable. The template is selected below; use your device's Copy command.");
    }
  }

  return (
    <details className="group/template panel p-5 sm:p-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-text marker:hidden [&::-webkit-details-marker]:hidden">
        {template.title}
        <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-muted transition-transform group-open/template:rotate-180" />
      </summary>
      <p id={`${prefix}-help`} className="mt-2 text-sm leading-6 text-text-soft">{template.description}</p>
      <div className="my-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} aria-label={`Copy ${template.title.toLowerCase()}`} className="button-secondary">
          {copied ? <Check aria-hidden="true" className="h-5 w-5" /> : <Copy aria-hidden="true" className="h-5 w-5" />}
          {copied ? "Copied" : "Copy template"}
        </button>
        <p role="status" className="text-sm leading-6 text-muted">{message}</p>
      </div>
      <label htmlFor={`${prefix}-text`} className="sr-only">{template.title} Markdown</label>
      <textarea ref={field} id={`${prefix}-text`} readOnly value={template.markdown} aria-describedby={`${prefix}-help`} rows={12} spellCheck={false} className="field font-mono text-sm leading-6" />
    </details>
  );
}
