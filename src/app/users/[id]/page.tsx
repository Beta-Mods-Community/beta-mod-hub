import Link from "next/link";
import { notFound } from "next/navigation";
import { Bug, CalendarDays, CheckCircle, ClipboardCheck, FileStack } from "lucide-react";

import StatusBadge from "@/components/status-badge";
import SeverityBadge from "@/components/severity-badge";
import ReportStatusBadge from "@/components/report-status-badge";
import ReputationBadge from "@/components/reputation-badge";
import SectionHeading from "@/components/section-heading";
import VerdictBadge from "@/components/verdict-badge";
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
    <main className="site-container w-full max-w-5xl flex-1 py-10 sm:py-12">
      {/* Header card */}
      <section className="panel p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={`${profile.displayName}'s avatar`}
              className="h-16 w-16 shrink-0 rounded-md border border-[var(--line-strong)] object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] text-xl font-semibold text-[var(--accent)]">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1 basis-48">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title">
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
          <p className="mt-5 max-w-3xl whitespace-pre-wrap break-words border-t border-[var(--line)] pt-5 text-sm leading-6 text-[var(--text-soft)]">
            {profile.bio}
          </p>
        )}
      </section>

      {/* Reputation breakdown */}
      <section className="mt-8" aria-labelledby="profile-history-heading">
        <SectionHeading
          id="profile-history-heading"
          title="Testing history"
          icon={ClipboardCheck}
          description="Participation across tested mods, readiness votes, and bug reports. A reputation score describes activity, not a guarantee of report quality or trustworthiness."
        />

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg border border-line bg-surface-soft p-5 sm:grid-cols-4 sm:p-6">
          <div className="min-w-0">
            <dt className="text-xs text-[var(--muted)]">
              Mods tested
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">
              {history.distinctModsTested}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--muted)]">
              Ready votes
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">
              {history.readyVotes}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--muted)]">
              Not-ready votes
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">
              {history.notReadyVotes}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--muted)]">
              Bugs filed
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">
              {history.minorBugs + history.majorBugs + history.blockingBugs}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Reputation is calculated from mods tested, votes, and bug reports.
          Score:{" "}
          <span className="font-semibold text-[var(--text-soft)]">
            {reputation} ({tier})
          </span>
          .
        </p>
      </section>

      {/* Beta Mods (authored) */}
      <section className="mt-8 border-t border-line pt-8" aria-labelledby="profile-mods-heading">
        <SectionHeading id="profile-mods-heading" title="Beta mods" icon={FileStack} />

        {mods.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-muted">
            No beta mods posted yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {mods.map((mod) => (
              <li key={mod.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/mods/${mod.id}`}
                    className="min-w-0 max-w-full break-words text-base font-semibold text-[var(--text)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
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
      <section className="mt-8 border-t border-line pt-8" aria-labelledby="profile-tested-heading">
        <SectionHeading id="profile-tested-heading" title="Mods tested" icon={CheckCircle} />

        {tested.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-muted">
            No build votes yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {tested.map((mod) => (
              <li key={mod.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/mods/${mod.id}`}
                    className="min-w-0 max-w-full break-words text-base font-semibold text-[var(--text)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
                  >
                    {mod.title}
                  </Link>
                  <VerdictBadge isCurrentBuild={mod.isCurrentBuild} ready={mod.myVote} />
                  {!mod.isCurrentBuild && mod.currentBuildVersion && (
                    <span className="text-xs text-muted">Latest build {mod.currentBuildVersion}</span>
                  )}
                  <span className="text-xs text-[var(--muted)]">
                    {mod.total > 0 ? `${mod.ready}/${mod.total} ready` : "No votes on the latest build"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bug reports filed */}
      <section className="mt-8 border-t border-line pt-8" aria-labelledby="profile-reports-heading">
        <SectionHeading id="profile-reports-heading" title="Bugs filed" icon={Bug} />

        {reports.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-muted">
            No bug reports filed yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {reports.map((report) => (
              <li key={report.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <SeverityBadge severity={report.severity} />
                  <ReportStatusBadge status={report.status} />
                  {report.buildVersion && (
                    <span className="rounded-sm bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-medium text-[var(--text-soft)]">
                      build {report.buildVersion}
                    </span>
                  )}
                  <Link
                    href={`/mods/${report.betaModId}`}
                    className="min-w-0 max-w-full break-words text-sm font-semibold text-[var(--text)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
                  >
                    {report.modTitle}
                  </Link>
                  <span className="ml-auto flex items-center gap-1 text-xs text-[var(--muted)]">
                    <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {formatDate(report.createdAt)}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-soft)]">
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
