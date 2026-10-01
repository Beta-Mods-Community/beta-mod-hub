import Link from "next/link";
import { ChevronDown, CircleHelp, Mail } from "lucide-react";
import { HelpGuideCards } from "@/components/help-navigation";
import SectionHeading from "@/components/section-heading";
import { helpFaqs } from "@lib/help-content";

export const metadata = {
  title: "Help",
  description: "How to test beta mods, report bugs, run a beta and prepare your files for Nexus Mods.",
};

export default function HelpPage() {
  return (
    <main className="site-container w-full flex-1 py-10 sm:py-12">
      <header className="mb-8 max-w-2xl">
        <h1 className="page-title">Help</h1>
        <p className="mt-4 text-base leading-7 text-text-soft">Test a build, give useful feedback, or get your own mod ready for release.</p>
      </header>
      <HelpGuideCards />
      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
        <section aria-labelledby="faq-heading" className="min-w-0">
          <SectionHeading title="Common questions" id="faq-heading" icon={CircleHelp} />
          <div className="mt-5 divide-y divide-line rounded-lg border border-line bg-surface-soft px-5 sm:px-6">
            {helpFaqs.map((faq) => (
              <details id={faq.id} key={faq.id} className="group/faq scroll-mt-24 py-2">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 py-3 text-sm font-semibold leading-6 text-text marker:hidden [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-muted transition-transform group-open/faq:rotate-180" />
                </summary>
                <p className="pb-5 pr-2 text-sm leading-7 text-text-soft">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <aside aria-labelledby="support-heading" className="panel p-6 lg:sticky lg:top-24">
          <SectionHeading title="Need a hand?" id="support-heading" icon={Mail} compact />
          <dl className="mt-5 space-y-5 text-sm leading-6">
            <div><dt className="font-semibold text-text">A bug in a mod</dt><dd className="mt-1 text-text-soft">Use Bug reports on that mod&apos;s page. Include the build version and steps that cause the problem.</dd></div>
            <div><dt className="font-semibold text-text">An account or site problem</dt><dd className="mt-1 text-text-soft">Tell us which page failed, what you tried, and the message you saw.</dd></div>
            <div><dt className="font-semibold text-text">Abuse or ownership concerns</dt><dd className="mt-1 text-text-soft">Use Report this listing, or contact us privately. Do not post personal details in a public bug report.</dd></div>
          </dl>
          <Link href="/contact" className="button-secondary mt-6 w-full">Contact support</Link>
          <p className="mt-4 text-xs leading-5 text-muted">Never send passwords, verification links or API keys.</p>
          <div className="mt-4 flex gap-5 border-t border-line pt-4 text-sm"><Link href="/rules" className="text-accent-strong hover:underline">Site rules</Link><Link href="/privacy" className="text-accent-strong hover:underline">Privacy</Link></div>
        </aside>
      </div>
    </main>
  );
}
