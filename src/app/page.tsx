import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Layers } from "lucide-react";

import ModCard from "@/components/mod-card";
import SectionHeading from "@/components/section-heading";
import { getCatalogPage } from "@lib/catalog";
import styles from "./home-hero.module.css";

export default async function Home() {
  const latestMods = (await getCatalogPage()).mods.slice(0, 3);

  return (
    <main className="flex-1 text-text">
      <section className={styles.hero} aria-labelledby="home-heading">
        <div className={styles.artwork} aria-hidden="true">
          <Image src="/images/dragon-hero.png" alt="" fill sizes="100vw" loading="eager" className={styles.dragon} />
        </div>
        <div className={styles.shade} aria-hidden="true" />
        <div className={styles.panels} aria-hidden="true" />
        <div className="site-container relative z-10 flex items-center py-12 sm:min-h-88 sm:py-16 lg:min-h-100 lg:py-20">
          <div className="max-w-xl">
            <h1 id="home-heading" className="max-w-[13ch] text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
              Game mods in testing
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-text-soft sm:text-lg">
              Download beta versions, report bugs, and help authors test their
              mods before release.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/browse"
                className="button-primary self-start"
              >
                Browse beta mods <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
        <div className="site-container section-divider relative z-10" aria-hidden="true" />
      </section>

      <section aria-labelledby="latest-heading" className="site-container py-10 sm:py-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <SectionHeading
              id="latest-heading"
              title="Latest beta mods"
              description="Recently posted active mods. Open a mod to find its available builds, requirements, and testing feedback."
              icon={Layers}
              className="section-title"
            />
          </div>
          <Link href="/browse" className="inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm font-medium text-text-soft transition hover:text-accent sm:self-auto">
            Browse all mods <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {latestMods.length > 0 ? (
          <div className={`mt-7 grid gap-5 sm:gap-6 ${latestMods.length > 2 ? "md:grid-cols-2 xl:grid-cols-3" : latestMods.length === 2 ? "md:grid-cols-2" : ""}`}>
            {latestMods.map((mod) => <ModCard key={mod.id} mod={mod} featured={latestMods.length === 1} headingLevel={3} />)}
          </div>
        ) : (
          <div className="mt-8 border-t border-line py-8">
            <h3 className="font-semibold text-text">No beta mods yet</h3>
            <p className="mt-2 text-sm text-muted">Use Post a beta in the header to add the first project.</p>
          </div>
        )}
      </section>
    </main>
  );
}
