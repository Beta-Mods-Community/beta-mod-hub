import Link from "next/link";
import { notFound } from "next/navigation";
import { Bug, CalendarDays, CheckCircle, FileStack, Palette } from "lucide-react";

import StatusBadge from "@/components/status-badge";
import SeverityBadge from "@/components/severity-badge";
import ReportStatusBadge from "@/components/report-status-badge";
import ReputationBadge from "@/components/reputation-badge";
import {
  getModsByOwner,
  getMyBugReports,
  getReputationHistory,
  getUserProfile,
  getVotedModsByUser,
} from "@lib/dal";
import { computeReputation, reputationTier } from "@lib/reputation";
import { formatDate } from "@lib/format";
import { getSession } from "@lib/session";

export const metadata = { title: "Profile" };

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [profile, mods, tested, reports, history, session] =
    await Promise.all([
      getUserProfile(id),
      getModsByOwner(id),
      getVotedModsByUser(id),
      getMyBugReports(id),
      getReputationHistory(id),
      getSession(),
    ]);
  if (!profile) notFound();

  const reputation = computeReputation(history);
  const tier = reputationTier(reputation);
  const isOwnProfile = session?.userId === profile.id;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      {/* Header card */}
      <section className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={`${profile.displayName}'s avatar`}
              className="h-16 w-16 rounded-full border border-zinc-200 object-cover dark:border-zinc-700"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-xl font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {profile.displayName}
              </h1>
              <ReputationBadge score={reputation} />
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {tier} · joined {formatDate(profile.createdAt)}
            </p>
            {profile.nexusUserId && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Nexus account linked
              </p>
            )}
          </div>
          {isOwnProfile && (
            <Link
              href="/profile/edit"
              className="ml-auto rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
            >
              Edit profile
            </Link>
          )}
        </div>

        {profile.bio && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            {profile.bio}
          </p>
        )}
      </section>

      {/* Reputation breakdown */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Testing history
          </h2>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">
              Mods tested
            </dt>
            <dd className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              {history.distinctModsTested}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">
              Ready votes
            </dt>
            <dd className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              {history.readyVotes}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">
              Not-ready votes
            </dt>
            <dd className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              {history.notReadyVotes}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">
              Bugs filed
            </dt>
            <dd className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              {history.minorBugs + history.majorBugs + history.blockingBugs}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          Reputation is derived from testing history — authors use it to judge
          how much a ready/not-ready vote is worth. Tester reputation score:{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {reputation} ({tier})
          </span>
          .
        </p>
      </section>

      {/* Beta Mods (authored) */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <FileStack className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Beta Mods
          </h2>
        </div>

        {mods.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No beta mods authored yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {mods.map((mod) => (
              <li key={mod.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/mods/${mod.id}`}
                    className="text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                  >
                    {mod.title}
                  </Link>
                  <StatusBadge status={mod.status} />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {mod.game}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mods tested */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Mods tested
          </h2>
        </div>

        {tested.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No ready votes cast yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {tested.map((mod) => (
              <li key={mod.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/mods/${mod.id}`}
                    className="text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                  >
                    {mod.title}
                  </Link>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      mod.myVote
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                    }`}
                  >
                    {mod.myVote ? "Ready" : "Not ready"}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {mod.ready}/{mod.total} ready
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bug reports filed */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <Bug className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Bugs filed
          </h2>
        </div>

        {reports.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No bug reports filed yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {reports.map((report) => (
              <li key={report.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <SeverityBadge severity={report.severity} />
                  <ReportStatusBadge status={report.status} />
                  <Link
                    href={`/mods/${report.betaModId}`}
                    className="text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                  >
                    {report.modTitle}
                  </Link>
                  <span className="ml-auto flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(report.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {report.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}