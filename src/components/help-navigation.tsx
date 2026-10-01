import Link from "next/link";
import { ArrowUpRight, Bug, FileArchive, Upload } from "lucide-react";
import { helpGuides, type HelpGuideSlug } from "@lib/help-content";

export const guideIcons = { testing: Bug, authors: Upload, releasing: FileArchive };
const guideLabels = { testing: "Testing", authors: "For authors", releasing: "Nexus release" };

export default function HelpNavigation({ current }: { current?: HelpGuideSlug }) {
  return (
    <nav aria-label="Help guides" className="flex flex-wrap gap-2 border-b border-line pb-5">
      <Link href="/help" aria-current={!current ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium ${!current ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-raised hover:text-text"}`}>
        All help
      </Link>
      {helpGuides.map((guide) => {
        const Icon = guideIcons[guide.slug];
        return (
          <Link key={guide.slug} href={`/help/${guide.slug}`} aria-current={current === guide.slug ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium ${current === guide.slug ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-raised hover:text-text"}`}>
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
            {guideLabels[guide.slug]}
          </Link>
        );
      })}
    </nav>
  );
}

export function HelpGuideCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {helpGuides.map((guide, index) => {
        const Icon = guideIcons[guide.slug];
        return (
          <Link key={guide.slug} href={`/help/${guide.slug}`} className="group panel flex min-w-0 flex-col p-6 transition-colors hover:border-accent/50 hover:bg-surface-raised">
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-lg border border-accent/25 bg-accent-soft text-accent-strong"><Icon aria-hidden="true" className="h-6 w-6" /></span>
              <span aria-hidden="true" className="font-mono text-xs text-muted">0{index + 1}</span>
            </div>
            <h2 className="mt-6 text-xl font-semibold tracking-tight text-text group-hover:text-accent-strong">{guide.title}</h2>
            <p className="mb-6 mt-3 text-sm leading-6 text-text-soft">{guide.description}</p>
            <span className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-accent-strong">Read guide <ArrowUpRight aria-hidden="true" className="h-5 w-5" /></span>
          </Link>
        );
      })}
    </div>
  );
}
