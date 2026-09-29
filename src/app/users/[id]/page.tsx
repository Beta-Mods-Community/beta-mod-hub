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
    <main className="site-container w-full max-w-5xl flex-1 py-10 sm:py-14">
      {/* Header card */}
      <section className="panel p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={`${profile.displayName}'s avatar`}
              className="h-16 w-16 rounded-md border border-[var(--line-strong)] object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] text-xl font-semibold text-[var(--accent)]">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                {profile.displayName}
              </h1>
              <ReputationBadge score={reputation} />
            </div>
            <p className="mt-1 text-sm text-[var(--text-soft)]">
              {tier} · joined {formatDate(profile.createdAt)}
            </p>
            {profile.nexusUserId && (
              <p className="mt-1 text-xs font-medium text-[var(--accent)]">
                Nexus account linked
              </p>
            )}
          </div>
          {isOwnProfile && (
            <Link
              href="/profile/edit"
              className="button-secondary ml-auto"
            >
              Edit profile
            </Link>
          )}
        </div>

        {profile.bio && (
          <p className="mt-5 max-w-3xl whitespace-pre-wrap border-t border-[var(--line)] pt-5 text-sm leading-6 text-[var(--text-soft)]">
            {profile.bio}
          </p>
        )}
      </section>

      {/* Reputation breakdown */}
      <section className="panel mt-6 p-5 sm:p-8">
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="eyebrow">
            Testing history
          </h2>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-[var(--muted)]">
              Mods tested
            </dt>
            <dd className="mt-1 text-xl font-semibold text-[var(--text)]">
              {history.distinctModsTested}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">
              Ready votes
            </dt>
            <dd className="mt-1 text-xl font-semibold text-[var(--text)]">
              {history.readyVotes}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">
              Not-ready votes
            </dt>
            <dd className="mt-1 text-xl font-semibold text-[var(--text)]">
              {history.notReadyVotes}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">
              Bugs filed
            </dt>
            <dd className="mt-1 text-xl font-semibold text-[var(--text)]">
              {history.minorBugs + history.majorBugs + history.blockingBugs}
            </dd>
          </div>
        </dl>

        <p className="mt-4 border-t border-[var(--line)] pt-4 text-xs leading-5 text-[var(--muted)]">
          Reputation is derived from testing history — authors use it to judge
          how much a ready/not-ready vote is worth. Tester reputation score:{" "}
          <span className="font-semibold text-[var(--text-soft)]">
            {reputation} ({tier})
          </span>
          .
        </p>
      </section>

      {/* Beta Mods (authored) */}
      <section className="panel mt-6 p-5 sm:p-8">
        <div className="mb-3 flex items-center gap-2">
          <FileStack className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="eyebrow">
            Beta Mods
          </h2>
        </div>

        {mods.length === 0 ? (
          <p className="text-sm text-muted">
            No beta mods authored yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {mods.map((mod) => (
              <li key={mod.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/mods/${mod.id}`}
                    className="text-sm font-semibold text-[var(--text)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
                  >
                    {mod.title}
                  </Link>
                  <StatusBadge status={mod.status} />
                  <span className="text-xs text-[var(--muted)]">
                    {mod.game}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mods tested */}
      <section className="panel mt-6 p-5 sm:p-8">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="eyebrow">
            Mods tested
          </h2>
        </div>

        {tested.length === 0 ? (
          <p className="text-sm text-muted">
            No ready votes cast yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {tested.map((mod) => (
              <li key={mod.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/mods/${mod.id}`}
                    className="text-sm font-semibold text-[var(--text)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
                  >
                    {mod.title}
                  </Link>
                  <span
                    className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.11em] ${
                      !mod.isCurrentBuild
                        ? "border-amber-500/35 bg-amber-500/10 text-amber-200"
                        : mod.myVote
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                          : "border-red-500/35 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {mod.isCurrentBuild
                      ? mod.myVote
                        ? "Ready"
                        : "Not ready"
                      : `Retest ${mod.currentBuildVersion ?? "needed"}`}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {mod.total > 0 ? `${mod.ready}/${mod.total} ready` : "Awaiting current-build verdicts"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bug reports filed */}
      <section className="panel mt-6 p-5 sm:p-8">
        <div className="mb-3 flex items-center gap-2">
          <Bug className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="eyebrow">
            Bugs filed
          </h2>
        </div>

        {reports.length === 0 ? (
          <p className="text-sm text-muted">
            No bug reports filed yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {reports.map((report) => (
              <li key={report.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <SeverityBadge severity={report.severity} />
                  <ReportStatusBadge status={report.status} />
                  {report.buildVersion && (
                    <span className="rounded-sm bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-soft)]">
                      build {report.buildVersion}
                    </span>
                  )}
                  <Link
                    href={`/mods/${report.betaModId}`}
                    className="text-sm font-semibold text-[var(--text)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
                  >
                    {report.modTitle}
                  </Link>
                  <span className="ml-auto flex items-center gap-1 text-xs text-[var(--muted)]">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(report.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-soft)]">
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
