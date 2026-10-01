import Link from "next/link";

import EmptyStateArt from "@/components/empty-state-art";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="site-container flex-1 py-12 sm:py-20">
      <div className="mx-auto max-w-xl">
        <EmptyStateArt kind="missing" />
        <h1 className="page-title">Page not found</h1>
        <p className="mt-4 text-base leading-7 text-[var(--muted)]">
          This page may have moved, been removed, or be unavailable to your account.
        </p>
        <Link href="/browse" className="button-primary mt-8">
          Browse mods
        </Link>
      </div>
    </main>
  );
}
