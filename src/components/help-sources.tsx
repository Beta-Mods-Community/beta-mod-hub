import type { HelpSource } from "@lib/help-content";

export default function HelpSources({ sources }: { sources?: readonly HelpSource[] }) {
  if (!sources?.length) return null;
  return (
    <ul aria-label="Official references" className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {sources.map((source) => (
        <li key={source.url}>
          <a href={source.url} className="inline-flex min-h-11 items-center text-accent-strong underline decoration-accent/40 underline-offset-4 hover:decoration-current">{source.title}</a>
        </li>
      ))}
    </ul>
  );
}
