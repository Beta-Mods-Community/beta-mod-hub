import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileArchive,
  Package,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";

import BugReportForm from "@/components/bug-report-form";
import BuildUploadForm from "@/components/build-upload-form";
import DeleteModButton from "@/components/delete-mod-button";
import ModArtwork from "@/components/mod-artwork";
import ReportStatusBadge from "@/components/report-status-badge";
import ReputationBadge from "@/components/reputation-badge";
import SeverityBadge from "@/components/severity-badge";
import StatusBadge from "@/components/status-badge";
import {
  getBetaMod,
  getBuildsByModId,
  getBugReportsByModId,
  getMyReadyVote,
  getReadyTally,
  getReputationHistoryByUserIds,
  getRequirementsByModId,
} from "@lib/dal";
import { MAX_UPLOAD_BYTES } from "@lib/definitions";
import { setBugReportStatus, voteReady } from "@lib/feedback";
import { formatDate } from "@lib/format";
import { effectiveArchiveLimit, readPilotLimits } from "@lib/pilot";
import { confirmPromotion } from "@lib/promote";
import { computeReputation } from "@lib/reputation";
import { addRequirement, removeRequirement } from "@lib/requirements";
import { getSession } from "@lib/session";
import { getUploadPermission } from "@lib/storage-usage";

const TAB_LINKS = [
  { href: "#overview", label: "Overview" },
  { href: "#files", label: "Files" },
  { href: "#requirements", label: "Requirements" },
  { href: "#bugs", label: "Bugs" },
] as const;

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
  const latestBuild = builds[0] ?? null;
  const myVote =
    !isOwner && session ? await getMyReadyVote(id, session.userId) : null;

  const pilotLimits = readPilotLimits();
  const uploadPermission = session
    ? await getUploadPermission(session.userId, pilotLimits)
    : ({ allowed: false, message: "Sign in to upload." } as const);
  const maxArchiveBytes = effectiveArchiveLimit(pilotLimits, MAX_UPLOAD_BYTES);

  const reporterIds = [
    ...new Set(bugReports.map((report) => report.reporterId).filter(Boolean)),
  ];
  const reputationByUser =
    reporterIds.length > 0
      ? await getReputationHistoryByUserIds(reporterIds)
      : new Map();
  const reporterScore = (userId: string | null) =>
    userId && reputationByUser.has(userId)
      ? computeReputation(reputationByUser.get(userId)!)
      : null;
  const openBugs = bugReports.filter((report) => report.status === "open").length;

  return (
    <main className="site-container flex-1 py-7 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-5">
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Active betas
        </Link>
      </nav>

      {isPromoted && (
        <section className="mb-5 flex flex-col gap-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-200">Released on Nexus</p>
            <p className="mt-1 text-xs leading-5 text-emerald-100/70">
              Testing is closed here. This page remains as the beta record.
            </p>
          </div>
          {mod.nexusUrl && (
            <Link href={mod.nexusUrl} className="button-secondary shrink-0">
              View live release
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </section>
      )}

      <article className="panel overflow-hidden">
        <div className="relative border-b border-[var(--line)]">
          <ModArtwork
            title={mod.title}
            game={mod.game}
            className="min-h-56 sm:min-h-72 lg:min-h-80"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(7,11,13,0.9),transparent_58%)]" />
          <div className="absolute left-5 top-5 sm:left-7 sm:top-7">
            <StatusBadge status={mod.status} />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <p className="eyebrow">{mod.game}</p>
            <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              {mod.title}
            </h1>
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-soft)]">
              <UserRound className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
              by
              <Link
                href={`/users/${mod.ownerId}`}
                className="font-semibold text-[var(--text)] hover:text-[var(--accent)]"
              >
                {mod.ownerName ?? "Unknown author"}
              </Link>
              <span className="text-[var(--muted)]" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                Updated {formatDate(mod.updatedAt)}
              </span>
            </p>
            {mod.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Tags">
                {mod.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-sm border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1 text-[11px] font-medium text-[var(--text-soft)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {isOwner && !isPromoted && (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Link href={`/mods/${mod.id}/edit`} className="button-secondary">
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                Edit page
              </Link>
              <DeleteModButton modId={mod.id} />
            </div>
          )}
        </div>
      </article>

      <nav
        aria-label="Mod page sections"
        className="mt-5 flex gap-1 overflow-x-auto border-b border-[var(--line)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TAB_LINKS.map((item, index) => (
          <a
            key={item.href}
            href={item.href}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              index === 0
                ? "border-[var(--accent)] text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {item.label}
            {item.href === "#files" && builds.length > 0 ? ` ${builds.length}` : ""}
            {item.href === "#bugs" && openBugs > 0 ? ` ${openBugs}` : ""}
          </a>
        ))}
      </nav>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          <section id="overview" className="panel scroll-mt-24 p-5 sm:p-7">
            <SectionHeading eyebrow="Overview" title="About this beta" />
            {mod.description ? (
              <p className="mt-5 whitespace-pre-wrap text-[0.94rem] leading-7 text-[var(--text-soft)]">
                {mod.description}
              </p>
            ) : (
              <EmptyCopy>No description has been added yet.</EmptyCopy>
            )}
          </section>

          <section id="files" className="panel scroll-mt-24 p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading eyebrow="Files" title="Test builds" />
              <span className="text-xs text-[var(--muted)]">
                {builds.length} {builds.length === 1 ? "build" : "builds"}
              </span>
            </div>

            {builds.length === 0 ? (
              <EmptyCopy>
                {isOwner
                  ? "Upload the first build to open testing."
                  : "The author has not uploaded a test build yet."}
              </EmptyCopy>
            ) : (
              <div className="mt-5 overflow-hidden rounded-md border border-[var(--line)]">
                {builds.map((build, index) => (
                  <article
                    key={build.id}
                    className={`grid gap-4 bg-[var(--surface-soft)] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5 ${
                      index > 0 ? "border-t border-[var(--line)]" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileArchive className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                        <h3 className="font-semibold text-[var(--text)]">
                          {build.versionLabel}
                        </h3>
                        {index === 0 && (
                          <span className="rounded-sm border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-[var(--muted)]">
                        Uploaded {formatDate(build.uploadedAt)}
                      </p>
                      {build.changelog && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-soft)]">
                          {build.changelog}
                        </p>
                      )}
                      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        ClamAV scan passed
                      </p>
                    </div>
                    <Link href={`/files/${build.id}`} className="button-secondary shrink-0">
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download
                    </Link>
                  </article>
                ))}
              </div>
            )}

            {isOwner && !isPromoted && (
              <details className="mt-5 rounded-md border border-[var(--line)] bg-[var(--surface-soft)]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--text)] marker:hidden">
                  Upload a new build
                </summary>
                <div className="border-t border-[var(--line)] p-4 sm:p-5">
                  {uploadPermission.allowed ? (
                    <BuildUploadForm betaModId={mod.id} maxBytes={maxArchiveBytes} />
                  ) : (
                    <p className="text-sm text-[var(--text-soft)]">{uploadPermission.message}</p>
                  )}
                </div>
              </details>
            )}
          </section>

          <section id="requirements" className="panel scroll-mt-24 p-5 sm:p-7">
            <SectionHeading eyebrow="Compatibility" title="Requirements" />
            {requirements.length === 0 ? (
              <EmptyCopy>No external requirements have been recorded.</EmptyCopy>
            ) : (
              <ul className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {requirements.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                    {item.nexusModUrl ? (
                      <a
                        href={item.nexusModUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 truncate font-medium text-[var(--text)] hover:text-[var(--accent)]"
                      >
                        {item.nexusModName}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate font-medium text-[var(--text)]">
                        {item.nexusModName}
                      </span>
                    )}
                    {isOwner && !isPromoted && (
                      <form action={removeRequirement.bind(null, item.id)}>
                        <button type="submit" className="text-xs text-[var(--muted)] hover:text-[var(--danger)]">
                          Remove
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {isOwner && !isPromoted && (
              <form action={addRequirement} className="mt-5 grid gap-3 sm:grid-cols-2">
                {req === "invalid" && (
                  <p className="sm:col-span-2 text-xs text-rose-300">
                    Add a name and a valid URL, or leave the URL blank.
                  </p>
                )}
                <input type="hidden" name="betaModId" value={mod.id} />
                <label className="text-xs font-semibold text-[var(--text-soft)]">
                  Mod name
                  <input
                    name="nexusModName"
                    required
                    maxLength={120}
                    placeholder="Required mod"
                    className="field mt-1.5"
                  />
                </label>
                <label className="text-xs font-semibold text-[var(--text-soft)]">
                  Nexus URL <span className="font-normal text-[var(--muted)]">(optional)</span>
                  <input
                    name="nexusModUrl"
                    maxLength={500}
                    placeholder="https://www.nexusmods.com/..."
                    className="field mt-1.5"
                  />
                </label>
                <button type="submit" className="button-secondary sm:col-span-2 sm:justify-self-start">
                  Add requirement
                </button>
              </form>
            )}
          </section>

          <section id="bugs" className="panel scroll-mt-24 p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading eyebrow="Issue tracker" title="Bug reports" />
              <span className="text-xs text-[var(--muted)]">
                {openBugs} open
              </span>
            </div>

            {bugReports.length === 0 ? (
              <EmptyCopy>No bugs have been reported for this beta.</EmptyCopy>
            ) : (
              <div className="mt-5 space-y-3">
                {bugReports.map((report) => {
                  const score = reporterScore(report.reporterId);
                  return (
                    <article key={report.id} className="rounded-md border border-[var(--line)] bg-[var(--surface-soft)] p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={report.severity} />
                        <ReportStatusBadge status={report.status} />
                        {report.buildVersion && (
                          <span className="rounded-sm bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-soft)]">
                            build {report.buildVersion}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-soft)]">
                        {report.description}
                      </p>
                      {report.reproSteps && (
                        <div className="mt-3 border-l-2 border-[var(--line-strong)] pl-3 text-sm leading-6 text-[var(--muted)]">
                          <span className="font-semibold text-[var(--text-soft)]">Reproduce: </span>
                          {report.reproSteps}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
                        {report.reporterId ? (
                          <Link href={`/users/${report.reporterId}`} className="font-medium text-[var(--text-soft)] hover:text-[var(--accent)]">
                            {report.reporterName ?? "Unknown tester"}
                          </Link>
                        ) : (
                          <span>{report.reporterName ?? "Unknown tester"}</span>
                        )}
                        {score !== null && <ReputationBadge score={score} />}
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(report.createdAt)}</span>
                      </div>

                      {isOwner && !isPromoted && (
                        <div className="mt-3 flex flex-wrap gap-3 text-xs">
                          {report.status === "open" && (
                            <form action={setBugReportStatus.bind(null, report.id, "acknowledged")}>
                              <button type="submit" className={ownerActionClass}>Acknowledge</button>
                            </form>
                          )}
                          {report.status !== "fixed" ? (
                            <form action={setBugReportStatus.bind(null, report.id, "fixed")}>
                              <button type="submit" className={ownerActionClass}>Mark fixed</button>
                            </form>
                          ) : (
                            <form action={setBugReportStatus.bind(null, report.id, "open")}>
                              <button type="submit" className={ownerActionClass}>Reopen</button>
                            </form>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {isPromoted ? (
              <p className="mt-5 border-t border-[var(--line)] pt-5 text-sm text-[var(--muted)]">
                New reports are closed because this release has moved to Nexus.
              </p>
            ) : !latestBuild ? (
              <p className="mt-5 border-t border-[var(--line)] pt-5 text-sm text-[var(--muted)]">
                Bug reporting opens when the first test build is uploaded.
              </p>
            ) : session ? (
              <details className="mt-5 rounded-md border border-[var(--line)] bg-[var(--surface-soft)]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--text)] marker:hidden">
                  File a bug report
                </summary>
                <div className="border-t border-[var(--line)] p-4 sm:p-5">
                  <BugReportForm
                    betaModId={mod.id}
                    builds={builds.map((build) => ({ id: build.id, versionLabel: build.versionLabel }))}
                  />
                </div>
              </details>
            ) : (
              <p className="mt-5 border-t border-[var(--line)] pt-5 text-sm text-[var(--muted)]">
                <Link href="/login" className="font-semibold text-[var(--text)] hover:text-[var(--accent)]">Sign in</Link>{" "}
                to report a bug.
              </p>
            )}
          </section>

          {isOwner && !isPromoted && (
            <section className="panel p-5 sm:p-7">
              <SectionHeading eyebrow="Nexus Mods" title="Publish your release" />
              <p className="mt-4 text-sm leading-6 text-[var(--text-soft)]">
                Download the latest build, description, and requirements as a package to upload to Nexus Mods. Add the Nexus page URL here once it is published.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <a href={`/mods/${mod.id}/promotion/download`} className="button-secondary">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download release package
                </a>
              </div>
              <form action={confirmPromotion} className="mt-5 grid gap-3 border-t border-[var(--line)] pt-5 sm:grid-cols-[minmax(0,1fr)_auto]">
                {promote === "invalid" && (
                  <p className="text-xs text-rose-300 sm:col-span-2">
                    Paste the full https:// Nexus mod page URL.
                  </p>
                )}
                <input type="hidden" name="betaModId" value={mod.id} />
                <label className="sr-only" htmlFor="nexus-url">Live Nexus URL</label>
                <input
                  id="nexus-url"
                  type="url"
                  name="nexusUrl"
                  required
                  placeholder="https://www.nexusmods.com/.../mods/123"
                  className="field"
                />
                <button type="submit" className="button-primary">Mark as published</button>
              </form>
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                This closes testing, removes the mod from Browse, and makes this record read-only.
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="panel p-5" aria-labelledby="release-signal-heading">
            <p className="eyebrow">Current build</p>
            <h2 id="release-signal-heading" className="mt-2 text-lg font-semibold text-[var(--text)]">
              Tester votes
            </h2>
            {latestBuild ? (
              <>
                <p className="mt-1 text-xs text-[var(--muted)]">Version {latestBuild.versionLabel}</p>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight text-[var(--text)]">{tally.ready}</span>
                  <span className="text-sm text-[var(--muted)]">of {tally.total} ready</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]" aria-hidden="true">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: tally.total > 0 ? `${(tally.ready / tally.total) * 100}%` : "0%" }}
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                  {tally.total > 0
                    ? "Only verdicts for the latest build are counted."
                    : "No votes for this build yet."}
                </p>

                {isPromoted ? (
                  <p className="mt-4 text-xs text-[var(--muted)]">Voting is closed.</p>
                ) : isOwner ? (
                  <p className="mt-4 text-xs text-[var(--muted)]">Authors cannot vote on their own builds.</p>
                ) : session ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <form action={voteReady.bind(null, mod.id, true)}>
                      <button
                        type="submit"
                        aria-pressed={myVote === true}
                        className={myVote === true ? voteActiveClass : voteIdleClass}
                      >
                        Ready
                      </button>
                    </form>
                    <form action={voteReady.bind(null, mod.id, false)}>
                      <button
                        type="submit"
                        aria-pressed={myVote === false}
                        className={myVote === false ? voteActiveClass : voteIdleClass}
                      >
                        Not ready
                      </button>
                    </form>
                  </div>
                ) : (
                  <Link href="/login" className="button-secondary mt-4 w-full">Sign in to vote</Link>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                Voting opens when the first build is uploaded.
              </p>
            )}
          </section>

          {latestBuild && (
            <section className="panel p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text)]">Scan passed</h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    The current archive passed ClamAV before storage. This is a malware scan, not a compatibility guarantee.
                  </p>
                </div>
              </div>
              <Link href={`/files/${latestBuild.id}`} className="button-primary mt-5 w-full">
                <Download className="h-4 w-4" aria-hidden="true" />
                Download {latestBuild.versionLabel}
              </Link>
            </section>
          )}

          <section className="panel p-5">
            <p className="eyebrow">Mod details</p>
            <dl className="mt-4 space-y-3 text-sm">
              <Fact label="Builds" value={String(builds.length)} icon={<Package className="h-3.5 w-3.5" />} />
              <Fact label="Open bugs" value={String(openBugs)} icon={<Bug className="h-3.5 w-3.5" />} />
              <Fact label="Ready verdicts" value={tally.total > 0 ? `${tally.ready}/${tally.total}` : "Awaiting"} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--text)]">{title}</h2>
    </div>
  );
}

function EmptyCopy({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)] px-4 py-7 text-center text-sm text-[var(--muted)]">
      {children}
    </p>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
      <dt className="flex items-center gap-2 text-[var(--muted)]">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="font-semibold text-[var(--text)]">{value}</dd>
    </div>
  );
}

const voteIdleClass =
  "min-h-10 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-soft)] px-2 text-xs font-semibold text-[var(--text-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]";
const voteActiveClass =
  "min-h-10 w-full rounded-md border border-[var(--accent)] bg-[var(--accent)] px-2 text-xs font-semibold text-[var(--accent-contrast)]";
const ownerActionClass =
  "font-semibold text-[var(--text-soft)] underline-offset-4 hover:text-[var(--accent)] hover:underline";
