import Link from "next/link";
import { notFound } from "next/navigation";
import { Bug, Package } from "lucide-react";

import StatusBadge from "@/components/status-badge";
import DeleteModButton from "@/components/delete-mod-button";
import { getBetaMod } from "@lib/dal";
import { formatDate } from "@lib/format";
import { getSession } from "@lib/session";

export default async function BetaModPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mod = await getBetaMod(id);
  if (!mod) notFound();

  const session = await getSession();
  const isOwner = session?.userId === mod.ownerId;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      {/* Header */}
      <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge status={mod.status} />
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {mod.game}
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {mod.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          by {mod.ownerName ?? "unknown"} · updated {formatDate(mod.updatedAt)}
        </p>
        {mod.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {mod.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {isOwner && (
          <div className="mt-6 flex items-center gap-3">
            <Link
              href={`/mods/${mod.id}/edit`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
            >
              Edit
            </Link>
            <DeleteModButton modId={mod.id} />
          </div>
        )}
      </div>

      {/* Description */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Description
        </h2>
        {mod.description ? (
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-300">
            {mod.description}
          </p>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No description yet.
          </p>
        )}
      </section>

      {/* Builds (files) */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Builds
          </h2>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No builds uploaded yet — build uploads are the next piece of the
          site.
        </p>
      </section>

      {/* Bugs */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <Bug className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Bugs
          </h2>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No bug reports yet — structured bug reports are coming next.
        </p>
      </section>
    </main>
  );
}