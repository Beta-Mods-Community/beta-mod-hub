import Link from "next/link";
import {
  ArrowUpRight,
  Bug,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FlaskConical,
  Layers,
  RotateCcw,
  UserCheck,
} from "lucide-react";

import StatusBadge from "@/components/status-badge";
import ContextHelp from "@/components/context-help";
import SectionHeading from "@/components/section-heading";
import SeverityBadge from "@/components/severity-badge";
import ReportStatusBadge from "@/components/report-status-badge";
import {
  getFeedbackSummaryByModIds,
  getMyBugReports,
  getModsByOwner,
  getUser,
  getVotedModsByUser,
  verifySession,
} from "@lib/dal";
import { formatDate } from "@lib/format";

export const metadata = { title: "Dashboard" };

const TABS = [
  { key: "building", label: "My mods", href: "/dashboard", icon: Layers },
  { key: "testing", label: "Test history", href: "/dashboard?tab=testing", icon: ClipboardCheck },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab: Tab = tabParam === "testing" ? "testing" : "building";
  const session = await verifySession();

  const [user, buildingData, testingData] = await Promise.all([
    getUser(),
    tab === "building"
      ? (async () => {
          const myMods = await getModsByOwner(session.userId);
          const summary = await getFeedbackSummaryByModIds(
            myMods.map((mod) => mod.id),
          );
          return { myMods, summary };
        })()
      : null,
    tab === "testing"
      ? Promise.all([
          getVotedModsByUser(session.userId),
          getMyBugReports(session.userId),
        ])
      : null,
  ]);

  return (
    <main className="site-container flex-1 py-10 sm:py-12">
      <header className="border-b border-line">
        <h1 className="text-3xl font-semibold tracking-tight text-text">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Welcome back, {user?.displayName ?? "modder"}. Manage your mods and review your testing history.
        </p>

        <nav aria-label="Dashboard views" className="mt-8 flex gap-7">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative inline-flex items-center gap-2 pb-3 text-sm font-semibold transition-colors ${
                  active
                    ? "text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                <item.icon aria-hidden="true" focusable="false" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                {item.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--accent)]" />
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      {tab === "building" ? (
        <BuildingPanel
          myMods={buildingData!.myMods}
          summary={buildingData!.summary}
        />
      ) : (
        <TestingPanel
          votedMods={testingData![0]}
          reports={testingData![1]}
        />
      )}
    </main>
  );
}

type FeedbackSummary = Map<
  string,
  { openBugs: number; ready: number; total: number }
>;

function BuildingPanel({
  myMods,
  summary,
}: {
  myMods: Awaited<ReturnType<typeof getModsByOwner>>;
  summary: FeedbackSummary;
}) {
  const openBugTotal = [...summary.values()].reduce(
    (total, item) => total + item.openBugs,
    0,
  );
  const testingCount = myMods.filter(
    (mod) => mod.status !== "promoted" && mod.status !== "abandoned",
  ).length;

  return (
    <section className="py-8 sm:py-10" aria-labelledby="releases-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <SectionHeading id="releases-heading" title="Your mods" description="Mods you have posted, with open bug counts across their builds and readiness votes for each latest build. Open a mod to review feedback or manage its testing." icon={Layers} />
        {myMods.length > 0 && (
          <p className="text-sm text-muted">
            {myMods.length} {myMods.length === 1 ? "project" : "projects"}
            {" · "}{testingCount} active {testingCount === 1 ? "beta" : "betas"}
            {" · "}{openBugTotal} open {openBugTotal === 1 ? "bug report" : "bug reports"}
          </p>
        )}
      </div>

      {myMods.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-5 w-5" aria-hidden="true" />}
          title="No beta mods yet"
          description="Use Post a beta to create a mod page, upload a build, and invite testers. Your projects and their feedback will appear here."
        />
      ) : (
        <div className="mt-5 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          {myMods.map((mod, index) => {
            const signal = summary.get(mod.id);
            return (
              <article
                key={mod.id}
                className={`grid gap-5 p-5 transition-colors hover:bg-[var(--surface-raised)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6 ${
                  index > 0 ? "border-t border-[var(--line)]" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <StatusBadge status={mod.status} />
                    <span className="text-xs font-medium text-[var(--muted)]">
                      {mod.game}
                    </span>
                    <span className="text-xs text-[var(--muted)]" aria-hidden="true">
                      /
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Updated {formatDate(mod.updatedAt)}
                    </span>
                  </div>
                  <h3 className="mt-3 truncate text-lg font-semibold tracking-tight text-[var(--text)]">
                    <Link
                      href={`/mods/${mod.id}`}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      {mod.title}
                    </Link>
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--text-soft)]">
                    <span className="inline-flex items-center gap-1.5">
                      <Bug className="h-3.5 w-3.5" aria-hidden="true" />
                      {signal?.openBugs ?? 0} open {signal?.openBugs === 1 ? "bug" : "bugs"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {signal && signal.total > 0
                        ? `${signal.ready} of ${signal.total} testers ready`
                        : "Awaiting first verdict"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <Link href={`/mods/${mod.id}/edit`} className="button-secondary">
                    Edit
                  </Link>
                  <Link href={`/mods/${mod.id}`} className="button-secondary">
                    Open
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TestingPanel({
  votedMods,
  reports,
}: {
  votedMods: Awaited<ReturnType<typeof getVotedModsByUser>>;
  reports: Awaited<ReturnType<typeof getMyBugReports>>;
}) {
  return (
    <section className="py-8 sm:py-10">
      <SectionHeading title="Your votes" description="Your most recent readiness vote for each mod. Votes stay attached to the build you tested, so a newer build needs a fresh test and vote." icon={UserCheck} />

      {votedMods.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="h-5 w-5" aria-hidden="true" />}
          title="No verdicts yet"
          description="After testing a build, vote on whether it is ready for release."
          action={{ href: "/browse", label: "Find a beta to test" }}
        />
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {votedMods.map((mod) => (
            <article key={mod.id} className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusBadge status={mod.status} />
                <ContextHelp
                  title={!mod.isCurrentBuild ? "Retest needed" : mod.myVote ? "Ready" : "Not ready"}
                  description={!mod.isCurrentBuild
                    ? "Your vote applies to an earlier build and does not count toward the current build. Test the latest available build before submitting a new verdict."
                    : mod.myVote
                      ? "You marked the current build ready for release based on your testing. This is your verdict, not a guarantee of compatibility."
                      : "You marked the current build as needing more work before release. A bug report can help the author understand what still needs fixing."}
                  className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                    !mod.isCurrentBuild
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : mod.myVote
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {!mod.isCurrentBuild && <RotateCcw aria-hidden="true" focusable="false" className="h-3 w-3 shrink-0" strokeWidth={1.8} />}
                  {mod.isCurrentBuild
                    ? mod.myVote
                      ? "Ready"
                      : "Not ready"
                    : "Retest needed"}
                </ContextHelp>
              </div>
              <h3 className="mt-4 text-base font-semibold text-[var(--text)]">
                <Link href={`/mods/${mod.id}`} className="hover:text-[var(--accent)]">
                  {mod.title}
                </Link>
              </h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {mod.game} · by {mod.ownerName ?? "unknown"}
              </p>
              {!mod.isCurrentBuild && (
                <p className="mt-3 rounded-sm border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-200/90">
                  Your {mod.myVote ? "ready" : "not-ready"} verdict was for {mod.voteBuildVersion ?? "an older build"}.
                  {mod.currentBuildVersion
                    ? ` Version ${mod.currentBuildVersion} needs a fresh test.`
                    : " There is no current build to retest."}
                </p>
              )}
              <div className="mt-4 border-t border-[var(--line)] pt-3 text-xs leading-5 text-[var(--text-soft)]">
                {mod.total > 0
                  ? `${mod.ready} of ${mod.total} testers ready`
                  : "No current-build verdicts"}
                {" · "}
                {mod.openBugs} open {mod.openBugs === 1 ? "bug" : "bugs"}
                {" · "}voted {formatDate(mod.votedAt)}
              </div>
            </article>
          ))}
        </div>
      )}

      <SectionHeading title="Bugs you filed" description="Bug reports you submitted, including the affected build and current status. Open the mod to read the author's response or record a retest." icon={Bug} className="mt-12" />

      {reports.length === 0 ? (
        <EmptyState
          icon={<Bug className="h-5 w-5" aria-hidden="true" />}
          title="No reports filed"
          description="Report a problem from a mod page. Include the build version and steps to reproduce it."
        />
      ) : (
        <div className="mt-5 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          {reports.map((report, index) => (
            <article
              key={report.id}
              className={`p-5 sm:p-6 ${index > 0 ? "border-t border-[var(--line)]" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={report.severity} />
                <ReportStatusBadge status={report.status} />
                {report.buildVersion && (
                  <span className="rounded-sm bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-soft)]">
                    build {report.buildVersion}
                  </span>
                )}
                <span className="text-xs text-[var(--muted)]">{formatDate(report.createdAt)}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                <Link
                  href={`/mods/${report.betaModId}`}
                  className="font-semibold text-[var(--text)] hover:text-[var(--accent)]"
                >
                  {report.modTitle}
                </Link>
                <span className="mx-2 text-[var(--muted)]">—</span>
                {report.description.length > 180
                  ? `${report.description.slice(0, 180)}…`
                  : report.description}
              </p>
            </article>
          ))}
        </div>
      )}

    </section>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mt-5 flex items-start gap-4 border-t border-line py-8">
      <span className="mt-1 shrink-0 text-muted">
        {icon}
      </span>
      <div>
        <h3 className="text-base font-semibold text-text">{title}</h3>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted">{description}</p>
        {action && (
          <Link href={action.href} className="button-secondary mt-4">
            {action.label}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}
