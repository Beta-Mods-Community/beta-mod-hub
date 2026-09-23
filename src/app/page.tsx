import Link from "next/link";
import { ArrowRight, Bug, CheckCircle2, Package } from "lucide-react";

const features = [
  {
    icon: Package,
    title: "Post your beta",
    description:
      "Upload WIP builds with real changelogs. Alpha, beta, RC — your first Nexus release stays your one shot.",
  },
  {
    icon: Bug,
    title: "Get structured feedback",
    description:
      "Testers file severity-graded bug reports with repro steps and attachments — not a comments wall.",
  },
  {
    icon: CheckCircle2,
    title: "Know when you're ready",
    description:
      "Ready / not-ready votes from real testers give you a signal before you spend your big launch.",
  },
];

const steps = [
  {
    step: "01",
    title: "Post a beta",
    body: "Create a Beta Mod page, upload a build, say what kind of testing you want.",
  },
  {
    step: "02",
    title: "Testers find it in Browse",
    body: "Live list of active betas, filterable by game, sorted by who needs testers most.",
  },
  {
    step: "03",
    title: "Promote to Nexus",
    body: "Generate a package with BBCode description, readme, changelog and files — paste top to bottom and you're live.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        {/* Hero */}
        <section className="flex flex-col items-center gap-6 py-24 text-center">
          <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Pre-release mod hosting for the Nexus community
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl">
            Test mods before they go live. Launch them properly.
          </h1>
          <p className="max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Your first Nexus release is your only shot at the spotlight.
            Beta Mods lets you get real testing and structured bug reports on
            a work-in-progress build — then promotes to Nexus with minimum
            friction.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/browse"
              className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-zinc-50 dark:text-zinc-950"
            >
              Browse active betas
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
            >
              Create an account
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <feature.icon className="mb-4 h-5 w-5 text-zinc-500 dark:text-zinc-400" />
              <h2 className="mb-1.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {feature.title}
              </h2>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {feature.description}
              </p>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section className="border-t border-zinc-200 py-20 dark:border-zinc-800">
          <h2 className="mb-10 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            How it works
          </h2>
          <div className="grid gap-10 sm:grid-cols-3">
            {steps.map((item) => (
              <div key={item.step} className="flex flex-col gap-2">
                <span className="font-mono text-sm text-zinc-400">
                  {item.step}
                </span>
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {item.title}
                </h3>
                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}