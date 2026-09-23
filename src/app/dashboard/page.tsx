import Link from "next/link";
import { Bug, ClipboardList, PlusCircle, UserCheck } from "lucide-react";

import StatusBadge from "@/components/status-badge";
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
  { key: "building", label: "Building", href: "/dashboard" },
  { key: "testing", label: "Testing", href: "/dashboard?tab=testing" },
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
            myMods.map((m) => m.id),
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

      {/* Tabs */}
      <nav className="mt-8 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50"
                : "border-transparent text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

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

// --- Building: own beta mods with live feedback ---

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
  return (
    <section className="mt-8">
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
          {myMods.map((mod) => {
            const s = summary.get(mod.id);
            return (
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
                {s && (
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {s.openBugs} open {s.openBugs === 1 ? "bug" : "bugs"} ·{" "}
                    {s.ready}/{s.total} ready
                  </p>
                )}
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
            );
          })}
        </div>
      )}
    </section>
  );
}

// --- Testing: tracked mods + own feedback history ---

function TestingPanel({
  votedMods,
  reports,
}: {
  votedMods: Awaited<ReturnType<typeof getVotedModsByUser>>;
  reports: Awaited<ReturnType<typeof getMyBugReports>>;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Testing now
        </h2>
      </div>

      {votedMods.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          You haven&apos;t voted on any betas yet. Head to{" "}
          <Link
            href="/browse"
            className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            Browse
          </Link>{" "}
          and cast your first ready/not-ready vote — it tracks the mod here.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {votedMods.map((mod) => (
            <div
              key={mod.id}
              className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-3">
                <StatusBadge status={mod.status} />
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    mod.myVote
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                  }`}
                >
                  You voted {mod.myVote ? "ready" : "not ready"}
                </span>
              </div>
              <h3 className="mt-3 text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                <Link
                  href={`/mods/${mod.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {mod.title}
                </Link>
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {mod.game} · by {mod.ownerName ?? "unknown"}
              </p>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                {mod.ready}/{mod.total} testers ready · {mod.openBugs} open{" "}
                {mod.openBugs === 1 ? "bug" : "bugs"} · voted{" "}
                {formatDate(mod.votedAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Your bug reports
        </h2>
      </div>

      {reports.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No bug reports yet. Found something broken on a beta? File a{" "}
          structured report on its page — severity, repro steps, and all.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {reports.map((report) => (
            <li key={report.id} className="px-6 py-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SeverityBadge severity={report.severity} />
                <ReportStatusBadge status={report.status} />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(report.createdAt)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                <Link
                  href={`/mods/${report.betaModId}`}
                  className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  {report.modTitle}
                </Link>
                {" — "}
                {report.description.length > 180
                  ? `${report.description.slice(0, 180)}…`
                  : report.description}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <Bug className="h-3.5 w-3.5" />
        Reports stay structured — no comment walls, by design.
      </p>
    </section>
  );
}