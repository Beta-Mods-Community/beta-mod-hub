import Link from "next/link";
export default function NotFound() {
  return <main className="site-container flex-1 py-16"><div className="panel mx-auto max-w-xl space-y-4 p-8">
    <h1 className="text-2xl font-semibold">Page not found</h1><p className="text-[var(--muted)]">This page may have moved, been removed, or be unavailable to your account.</p>
    <Link href="/browse" className="button-primary">Browse mods</Link>
  </div></main>;
}
