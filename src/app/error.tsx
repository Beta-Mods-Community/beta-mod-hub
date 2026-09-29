"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="site-container flex-1 py-16"><div className="panel mx-auto max-w-xl space-y-4 p-8">
    <h1 className="text-2xl font-semibold">This page could not load</h1>
    <p className="text-[var(--muted)]">Try again in a moment. If you were submitting an upload or report, check whether it appeared before sending it again.</p>
    <button onClick={reset} className="button-primary">Try again</button><Link className="button-secondary ml-3" href="/contact">Get help</Link>
  </div></main>;
}
