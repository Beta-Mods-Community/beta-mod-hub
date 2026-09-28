import Link from "next/link";
import { ArrowRight, Bug, CheckCircle2, PackageOpen, Radar, UploadCloud } from "lucide-react";

import ModCard from "@/components/mod-card";
import { getBrowseFeed } from "@lib/dal";

const workflow = [
  {
    number: "01",
    icon: UploadCloud,
    title: "Publish a test build",
    body: "Keep work-in-progress files, changelogs, and requirements together before release day.",
  },
  {
    number: "02",
    icon: Bug,
    title: "Turn playtime into signal",
    body: "Collect reproducible bug reports and readiness votes from the people running your build.",
  },
  {
    number: "03",
    icon: CheckCircle2,
    title: "Ship with confidence",
    body: "Package the tested release for its permanent Nexus page when the build is ready.",
  },
];

const capabilities = [
  {
    icon: PackageOpen,
    title: "Versioned builds",
    body: "Keep each test release and its changelog in the same project history.",
  },
  {
    icon: Bug,
    title: "Actionable reports",
    body: "Capture severity, reproduction steps, and the exact build under test.",
  },
  {
    icon: CheckCircle2,
    title: "A visible readiness signal",
    body: "See tester verdicts alongside unresolved issues before you promote.",
  },
];

export default async function Home() {
  const latestMods = (await getBrowseFeed(undefined, "newest")).slice(0, 3);

  return (
    <main className="flex-1 bg-zinc-950 text-zinc-100">
      <section className="border-b border-zinc-800/90">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-16 sm:px-6 md:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:items-center lg:px-8 lg:py-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]" />
              Pre-release workshop
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
              Better testing before your mod meets the world.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
              Beta Mods gives authors a focused place for test builds,
              structured bug reports, and release-readiness feedback—then
              keeps the handoff to Nexus clean.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/browse"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                Explore active betas <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/mods/new"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-600 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
              >
                Post a beta
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl shadow-black/30 sm:p-7">
            <div className="absolute right-0 top-0 h-px w-2/3 bg-cyan-300/40" />
            <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Release path</p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-100">One build, clear next steps</h2>
              </div>
              <Radar className="h-5 w-5 text-zinc-500" />
            </div>
            <ol className="mt-2">
              {workflow.map((item, index) => (
                <li key={item.number} className="grid grid-cols-[2.25rem_1fr] gap-3 border-b border-zinc-800/80 py-5 last:border-0 last:pb-1">
                  <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950 text-cyan-300">
                    <item.icon className="h-4 w-4" />
                    {index < workflow.length - 1 && <span className="absolute left-1/2 top-full h-6 w-px bg-zinc-700" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-zinc-600">{item.number}</span>
                      <h3 className="text-sm font-semibold text-zinc-200">{item.title}</h3>
                    </div>
                    <p className="mt-1.5 text-sm leading-5 text-zinc-500">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Live test bench</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Recently opened for testing</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
              Real projects from the active beta feed, with testing activity shown directly on each card.
            </p>
          </div>
          <Link href="/browse" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-300 transition hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            View the full feed <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {latestMods.length > 0 ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {latestMods.map((mod) => <ModCard key={mod.id} mod={mod} />)}
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-start rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <div>
              <h3 className="font-semibold text-zinc-200">The test bench is open.</h3>
              <p className="mt-1 text-sm text-zinc-500">There are no active beta listings yet.</p>
            </div>
            <Link href="/mods/new" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200 sm:mt-0">
              Post the first beta <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </section>

      <section className="border-t border-zinc-800/90 bg-zinc-900/35">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
          {capabilities.map((item) => (
            <div key={item.title} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-cyan-300">
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">{item.title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-zinc-500">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
