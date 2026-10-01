import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";
import HelpNavigation from "@/components/help-navigation";
import HelpTemplate from "@/components/help-template";
import HelpSources from "@/components/help-sources";
import ReleaseChecklist from "@/components/release-checklist";
import { helpGuides, helpTemplates, helpReview } from "@lib/help-content";

type Props = { params: Promise<{ guide: string }> };

export function generateStaticParams() {
  return helpGuides.map((guide) => ({ guide: guide.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { guide: slug } = await params;
  const guide = helpGuides.find((item) => item.slug === slug);
  return guide ? { title: guide.title, description: guide.description } : { title: "Guide not found" };
}

export default async function HelpGuidePage({ params }: Props) {
  const { guide: slug } = await params;
  const guide = helpGuides.find((item) => item.slug === slug);
  if (!guide) notFound();
  const extras = guide.slug === "authors" ? { id: "templates", title: "Description templates" } : guide.slug === "releasing" ? { id: "release-checklist", title: "Release checklist" } : null;
  const sectionLinks = [...guide.sections, ...(extras ? [extras] : [])].map((section, index) => (
    <a key={section.id} href={`#${section.id}`} className="flex min-h-11 items-start gap-3 rounded-md px-3 py-3 text-sm leading-5 text-muted hover:bg-surface-raised hover:text-text">
      <span aria-hidden="true" className="pt-0.5 font-mono text-xs text-accent-strong">{String(index + 1).padStart(2, "0")}</span>
      <span>{section.title}</span>
    </a>
  ));

  return (
    <main className="site-container w-full flex-1 py-8 sm:py-10">
      <HelpNavigation current={guide.slug} />
      <header className="mb-8 mt-8 max-w-3xl lg:ml-68">
        <h1 className="page-title">{guide.title}</h1>
        <p className="mt-4 text-base leading-7 text-text-soft">{guide.description}</p>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0 lg:sticky lg:top-24">
          <details className="group/sections rounded-lg bg-surface-soft p-3 lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-medium text-text marker:hidden [&::-webkit-details-marker]:hidden">Jump to a section <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-muted group-open/sections:rotate-180" /></summary>
            <nav aria-label="Guide sections">{sectionLinks}</nav>
          </details>
          <nav aria-label="Guide sections" className="hidden rounded-lg bg-surface-soft p-3 lg:block">{sectionLinks}</nav>
        </div>
        <article className="min-w-0 max-w-3xl">
          <div className="space-y-10">
            {guide.sections.map((section) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24 border-t border-line pt-7">
                <h2 id={`${section.id}-heading`} className="section-title">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-text-soft">
                  {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.steps && <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-accent-strong">{section.steps.map((step) => <li key={step} className="pl-2">{step}</li>)}</ol>}
                  {section.bullets && <ul className="list-disc space-y-2 pl-5 marker:text-accent-strong">{section.bullets.map((item) => <li key={item} className="pl-2">{item}</li>)}</ul>}
                </div>
                <HelpSources sources={section.sources} />
              </section>
            ))}
            {guide.slug === "authors" && (
              <section id="templates" aria-labelledby="templates-heading" className="scroll-mt-24 border-t border-line pt-7">
                <h2 id="templates-heading" className="section-title">Description templates</h2>
                <p className="mb-5 mt-3 text-sm leading-7 text-text-soft">Copy what you need into your listing description. Fill in the details for your mod and remove anything that does not apply. Nothing is added to your listing automatically.</p>
                <div className="space-y-4">{helpTemplates.map((template) => <HelpTemplate key={template.id} template={template} />)}</div>
              </section>
            )}
            {guide.slug === "releasing" && <section id="release-checklist" className="scroll-mt-24"><ReleaseChecklist /></section>}
          </div>
          <footer className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
            <Link href="/help" className="inline-flex min-h-11 items-center text-accent-strong hover:underline">Questions and support</Link>
            {guide.slug === "releasing" ? <a href="https://help.nexusmods.com/article/136-best-practices-for-mod-authors" className="inline-flex min-h-11 items-center text-accent-strong hover:underline">Nexus Mods author guidance</a> : <Link href={guide.slug === "testing" ? "/browse" : "/mods/new"} className="inline-flex min-h-11 items-center text-accent-strong hover:underline">{guide.slug === "testing" ? "Browse beta mods" : "Post a beta"}</Link>}
          </footer>
          <p className="mt-4 text-xs leading-6 text-muted">Checked <time dateTime={helpReview.date}>{helpReview.label}</time>. Beta Mods instructions describe this site&apos;s current features. Linked services may change their requirements.</p>
        </article>
      </div>
    </main>
  );
}
