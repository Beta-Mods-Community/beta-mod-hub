import Link from "next/link";
import { Package, PlusCircle, Search } from "lucide-react";

import { getUser, verifySession } from "@lib/dal";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // Auth gate — redirects to /login when there's no valid session.
  await verifySession();
  const user = await getUser();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Welcome back, {user?.displayName ?? "modder"}.
      </h1>
      <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Your Beta Mods and their test results will live here — posting betas,
        build uploads, and the readiness signal are the next features in the
        build.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <PlusCircle className="mb-4 h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <h2 className="mb-1.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Post a beta
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Create a Beta Mod page and push your first testing build.
            <span className="text-zinc-400 dark:text-zinc-500"> — coming next.</span>
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <Package className="mb-4 h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <h2 className="mb-1.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Your betas
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Track testers, bug reports, and ready votes per build once uploads
            land.
          </p>
        </div>
        <Link
          href="/browse"
          className="group rounded-lg border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <Search className="mb-4 h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <h2 className="mb-1.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Browse betas
          </h2>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Find betas that need testers and file your first bug report.
          </p>
        </Link>
      </div>
    </main>
  );
}