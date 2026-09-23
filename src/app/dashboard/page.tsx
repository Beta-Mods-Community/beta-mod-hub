import Link from "next/link";
import { Bug, PlusCircle } from "lucide-react";

import StatusBadge from "@/components/status-badge";
import { getOwnBetaMods, getUser, verifySession } from "@lib/dal";
import { formatDate } from "@lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // Auth gate — redirects to /login when there's no valid session.
  await verifySession();
  const [user, myMods] = await Promise.all([
    getUser(),
    getOwnBetaMods((await verifySession()).userId),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Welcome back, {user?.displayName ?? "modder"}.
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Your Beta Mods and their test results live here.
          </p>
        </div>
        <Link
          href="/mods/new"
          className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-zinc-50 dark:text-zinc-950"
        >
          <PlusCircle className="h-4 w-4" />
          Post a beta
        </Link>
      </div>

      {/* Building — own beta mods */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Your betas
        </h2>
        {myMods.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            You haven&apos;t posted any betas yet.{" "}
            <Link
              href="/mods/new"
              className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
            >
              Post your first beta
            </Link>
            .
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {myMods.map((mod) => (
              <div
                key={mod.id}
                className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={mod.status} />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(mod.updatedAt)}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  {mod.title}
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {mod.game}
                </p>
                <div className="mt-4 flex items-center gap-3 text-sm">
                  <Link
                    href={`/mods/${mod.id}`}
                    className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                  >
                    View
                  </Link>
                  <Link
                    href={`/mods/${mod.id}/edit`}
                    className="text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Testing — own feedback history */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Testing
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <Bug className="mb-4 h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            The mods you&apos;re tracking, your bug reports, and ready/not-ready
            votes will show here once bug reports and votes land.
          </p>
        </div>
      </section>
    </main>
  );
}