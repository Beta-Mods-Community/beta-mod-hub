"use client";

import Link from "next/link";

import EmptyStateArt from "@/components/empty-state-art";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="site-container flex-1 py-12 sm:py-20">
      <div className="mx-auto max-w-xl">
        <EmptyStateArt kind="error" />
        <h1 className="page-title">This page could not load</h1>
        <p className="mt-4 text-base leading-7 text-[var(--muted)]">
          Try again in a moment. If you were submitting an upload or report, check whether it appeared before sending it again.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button onClick={reset} className="button-primary">
            Try again
          </button>
          <Link className="button-secondary" href="/contact">
            Get help
          </Link>
        </div>
      </div>
    </main>
  );
}
