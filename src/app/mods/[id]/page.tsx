import Link from "next/link";
import { notFound } from "next/navigation";
import { Bug, Download, Package } from "lucide-react";

import StatusBadge from "@/components/status-badge";
import SeverityBadge from "@/components/severity-badge";
import ReportStatusBadge from "@/components/report-status-badge";
import ReputationBadge from "@/components/reputation-badge";
import DeleteModButton from "@/components/delete-mod-button";
import BuildUploadForm from "@/components/build-upload-form";
import BugReportForm from "@/components/bug-report-form";
import {
  getBetaMod,
  getBuildsByModId,
  getBugReportsByModId,
  getMyReadyVote,
  getReadyTally,
  getReputationHistoryByUserIds,
  getRequirementsByModId,
} from "@lib/dal";
import { computeReputation } from "@lib/reputation";
import { setBugReportStatus, voteReady } from "@lib/feedback";
import { formatDate } from "@lib/format";
import { confirmPromotion } from "@lib/promote";
import { addRequirement, removeRequirement } from "@lib/requirements";
import { getSession } from "@lib/session";

export default async function BetaModPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ promote?: string; req?: string }>;
}) {
  const { id } = await params;
  const { promote, req } = await searchParams;
  const [mod, builds, bugReports, tally, requirements, session] =
    await Promise.all([
      getBetaMod(id),
      getBuildsByModId(id),
      getBugReportsByModId(id),
      getReadyTally(id),
      getRequirementsByModId(id),
      getSession(),
    ]);
  if (!mod) notFound();

  const isPromoted = mod.status === "promoted";
  const isOwner = session?.userId === mod.ownerId;
  const myVote = !isOwner && session ? await getMyReadyVote(id, session.userId) : null;

  // Reputation for every reporter who filed on this page — authors use it to
  // weigh how much to trust a report or its reporter's ready vote.
  const reporterIds = [...new Set(bugReports.map((r) => r.reporterId).filter(Boolean))];
  const reputationByUser =
    reporterIds.length > 0
      ? await getReputationHistoryByUserIds(reporterIds)
      : new Map();
  const reporterScore = (userId: string | null) =>
    userId && reputationByUser.has(userId)
      ? computeReputation(reputationByUser.get(userId)!)
      : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      {/* Promoted — the beta page is read-only and links to its Nexus home */}
      {isPromoted && (
        <section className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            This beta has been promoted — it now lives on Nexus. This page is
            read-only.
          </p>
          {mod.nexusUrl && (
            <Link
              href={mod.nexusUrl}
              className="mt-2 inline-block text-sm font-medium text-emerald-900 underline-offset-4 hover:underline dark:text-emerald-100"
            >
              View on Nexus →
            </Link>
          )}
        </section>
      )}

      {/* Header */}
      <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
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
              by{" "}
              <Link
                href={`/users/${mod.ownerId}`}
                className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
              >
                {mod.ownerName ?? "unknown"}
              </Link>{" "}
              · updated {formatDate(mod.updatedAt)}
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
            {isOwner && !isPromoted && (
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

          {/* Release signal */}
          <div className="w-full max-w-xs rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Release signal
            </h2>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {tally.ready}
              <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
                {" "}
                / {tally.total}
              </span>
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              testers say ready
            </p>

            {isPromoted ? (
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                Voting closed — this beta has been promoted.
              </p>
            ) : isOwner ? (
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                Votes come from testers — authors don&apos;t vote on their own
                betas.
              </p>
            ) : session ? (
              <div className="mt-3 flex gap-2">
                <form action={voteReady.bind(null, mod.id, true)}>
                  <button
                    type="submit"
                    className={
                      myVote === true
                        ? voteActive
                        : voteIdle
                    }
                  >
                    Ready
                  </button>
                </form>
                <form action={voteReady.bind(null, mod.id, false)}>
                  <button
                    type="submit"
                    className={
                      myVote === false
                        ? voteActive
                        : voteIdle
                    }
                  >
                    Not ready
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href="/login"
                className="mt-3 block text-xs font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
              >
                Sign in to vote
              </Link>
            )}
          </div>
        </div>
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

      {/* Requirements — author-declared; feeds the promotion package */}
      {(requirements.length > 0 || (isOwner && !isPromoted)) && (
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Requirements
          </h2>

          {requirements.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No requirements recorded yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {requirements.map((reqItem) => (
                <li
                  key={reqItem.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {reqItem.nexusModUrl ? (
                      <a
                        href={reqItem.nexusModUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
                      >
                        {reqItem.nexusModName}
                      </a>
                    ) : (
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {reqItem.nexusModName}
                      </span>
                    )}
                  </span>
                  {isOwner && !isPromoted && (
                    <form
                      action={removeRequirement.bind(null, reqItem.id)}
                      className="shrink-0"
                    >
                      <button
                        type="submit"
                        className="text-xs text-zinc-500 underline-offset-4 hover:text-zinc-950 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isOwner && !isPromoted && (
            <form
              action={addRequirement}
              className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
            >
              {req === "invalid" && (
                <p className="w-full text-xs text-red-600 dark:text-red-400">
                  Check the requirement fields — name is required and the URL
                  must be valid.
                </p>
              )}
              <input type="hidden" name="betaModId" value={mod.id} />
              <input
                name="nexusModName"
                required
                maxLength={120}
                placeholder="Required mod name"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
              <input
                name="nexusModUrl"
                maxLength={500}
                placeholder="https://www.nexusmods.com/… (optional)"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
              >
                Add
              </button>
            </form>
          )}
        </section>
      )}

      {/* Files */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Builds
          </h2>
        </div>

        {builds.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No builds uploaded yet —
            {isOwner ? " upload the first one below." : " check back soon."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {builds.map((build) => (
              <li
                key={build.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {build.versionLabel}
                  </p>
                  {build.changelog && (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      {build.changelog}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    uploaded {formatDate(build.uploadedAt)}
                  </p>
                </div>
                <Link
                  href={`/files/${build.id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isOwner && !isPromoted && (
          <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <BuildUploadForm betaModId={mod.id} />
          </div>
        )}
      </section>

      {/* Promotion — owner only; package download + confirm (spec "Promotion flow") */}
      {isOwner && !isPromoted && (
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Promotion
          </h2>
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            Download the package below and use it top-to-bottom when creating
            your Nexus page — each file is a paste target for a specific step.
            The build archive is included, ready to drag into Files.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <li>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                description.bbcode.txt
              </span>{" "}
              — paste into the Description field (BBCode)
            </li>
            <li>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                summary.txt / readme.txt / changelog.txt
              </span>{" "}
              — short description, Docs, and changelog steps
            </li>
            <li>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                requirements.txt
              </span>{" "}
              — dependency checklist (search-and-link, not paste)
            </li>
            <li>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                files/
              </span>{" "}
              — the mod archive;{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                media/
              </span>{" "}
              is not generated yet — no screenshot support
            </li>
          </ul>

          <a
            href={`/mods/${mod.id}/promotion/download`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
          >
            <Download className="h-4 w-4" />
            Download promotion package
          </a>

          <form
            action={confirmPromotion}
            className="mt-6 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
          >
            {promote === "invalid" && (
              <p className="w-full text-xs text-red-600 dark:text-red-400">
                That doesn&apos;t look like a valid URL — paste the full
                https://… Nexus page.
              </p>
            )}
            <input type="hidden" name="betaModId" value={mod.id} />
            <input
              type="url"
              name="nexusUrl"
              required
              placeholder="https://www.nexusmods.com/…/mods/123"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Mark promoted
            </button>
          </form>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Marking promoted moves the mod off Browse and makes this page
            read-only.
          </p>
        </section>
      )}

      {/* Bugs — structured reports only, no comment wall */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <Bug className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Bugs
          </h2>
          {bugReports.length > 0 && (
            <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
              {bugReports.filter((r) => r.status === "open").length} open
            </span>
          )}
        </div>

        {bugReports.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No bug reports yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {bugReports.map((report) => (
              <li key={report.id} className="py-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <SeverityBadge severity={report.severity} />
                  <ReportStatusBadge status={report.status} />
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {report.reporterId ? (
                      <Link
                        href={`/users/${report.reporterId}`}
                        className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
                      >
                        {report.reporterName ?? "unknown"}
                      </Link>
                    ) : (
                      report.reporterName ?? "unknown"
                    )}
                    {reporterScore(report.reporterId) !== null && (
                      <ReputationBadge score={reporterScore(report.reporterId)!} />
                    )}
                    · {formatDate(report.createdAt)}
                  </span>
                  {report.buildVersion && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      · build {report.buildVersion}
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                  {report.description}
                </p>
                {report.reproSteps && (
                  <div className="mt-2 rounded-md bg-zinc-50 p-3 text-sm leading-6 text-zinc-600 dark:bg-zinc-950/60 dark:text-zinc-400">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      Repro:
                    </span>{" "}
                    {report.reproSteps}
                  </div>
                )}

                {isOwner && !isPromoted && report.status !== "fixed" && (
                  <div className="mt-3 flex gap-2 text-xs">
                    {report.status === "open" && (
                      <form
                        action={setBugReportStatus.bind(
                          null,
                          report.id,
                          "acknowledged",
                        )}
                      >
                        <button type="submit" className={ownerActionIdle}>
                          Acknowledge
                        </button>
                      </form>
                    )}
                    <form
                      action={setBugReportStatus.bind(null, report.id, "fixed")}
                    >
                      <button type="submit" className={ownerActionIdle}>
                        Mark fixed
                      </button>
                    </form>
                  </div>
                )}
                {isOwner && !isPromoted && report.status === "fixed" && (
                  <form
                    action={setBugReportStatus.bind(null, report.id, "open")}
                    className="mt-3"
                  >
                    <button type="submit" className={ownerActionIdle}>
                      Reopen
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {isPromoted ? (
          <p className="mt-6 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            This beta is promoted — new bug reports are closed.
          </p>
        ) : session ? (
          <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <BugReportForm betaModId={mod.id} />
          </div>
        ) : (
          <p className="mt-6 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <Link
              href="/login"
              className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
            >
              Sign in
            </Link>{" "}
            to file a bug report.
          </p>
        )}
      </section>
    </main>
  );
}

const voteIdle =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50";
const voteActive =
  "rounded-md border border-zinc-950 bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950";
const ownerActionIdle =
  "text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400";