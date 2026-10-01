import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Bug,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Download,
  ExternalLink,
  FileArchive,
  ListChecks,
  PackageCheck,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";

import BugReports from "@/components/bug-reports";
import BuildUploadForm from "@/components/build-upload-form";
import ContextHelp from "@/components/context-help";
import DeleteModButton from "@/components/delete-mod-button";
import ModGallery from "@/components/mod-gallery";
import ModMediaManager from "@/components/mod-media-manager";
import Markdown from "@/components/markdown";
import ReportContentForm from "@/components/report-content-form";
import SectionHeading from "@/components/section-heading";
import TestingChecklist from "@/components/testing-checklist";
import { modFollows } from "@/db/community-schema";
import { bugReports } from "@/db/schema";
import { db } from "@lib/db";
import { setFollow } from "@lib/community";
import { getModMedia } from "@lib/media-service";
import { MediaIdSchema } from "@lib/media-policy";
import StatusBadge from "@/components/status-badge";
import {
  getBetaMod,
  getBuildsByModId,
  getMyReadyVote,
  getReadyTally,
  getRequirementsByModId,
} from "@lib/dal";
import { MAX_UPLOAD_BYTES } from "@lib/definitions";
import { voteReady } from "@lib/feedback";
import { formatDate } from "@lib/format";
import { modExcerpt } from "@lib/mod-excerpt";
import { effectiveArchiveLimit, readPilotLimits, isCloudPilot } from "@lib/pilot";
import { confirmPromotion } from "@lib/promote";
import { addRequirement, removeRequirement } from "@lib/requirements";
import { getSession } from "@lib/session";
import { getUploadPermission } from "@lib/storage-usage";

const SECTION_LINKS = [
  { href: "#overview", label: "Overview", icon: BookOpen },
  { href: "#files", label: "Files", icon: FileArchive },
  { href: "#requirements", label: "Requirements", icon: ListChecks },
  { href: "#bugs", label: "Bugs", icon: Bug },
  { href: "#testing", label: "Testing", icon: ClipboardCheck },
] as const;

const SCAN_HELP = "This file passed a malware scan before it was shared. A clean scan cannot guarantee safety, game compatibility, or protection of your saves. Back up your saves before testing.";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const mod = MediaIdSchema.safeParse(id).success ? await getBetaMod(id) : null;
  // Hidden listings never disclose their title or description in metadata,
  // including when an owner/admin can view the page for moderation.
  if (!mod || mod.hiddenAt) return { title: "Mod unavailable", description: "This mod is not available.", robots: { index: false, follow: false } };
  const plain = (mod.description ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[#*_`>~|]/g, "")
    .replace(/\s+/g, " ").trim();
  const excerpt = Array.from(plain).slice(0, 157).join("");
  const description = plain ? `${excerpt}${Array.from(plain).length > 157 ? "…" : ""}` : `${mod.title} for ${mod.game}. View test builds, requirements and bug reports.`;
  return { title: mod.title, description, openGraph: { title: mod.title, description, type: "website", siteName: "Beta Mods" } };
}

export default async function BetaModPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ promote?: string; req?: string; feedback?: string; bugStatus?: string; bugBuild?: string; bugPage?: string }>;
}) {
  const { id } = await params;
  if (!MediaIdSchema.safeParse(id).success) notFound();
  const { promote, req, feedback, bugStatus, bugBuild, bugPage } = await searchParams;
  const [mod, builds, tally, requirements, session, media, bugCounts] =
    await Promise.all([
      getBetaMod(id),
      getBuildsByModId(id),
      getReadyTally(id),
      getRequirementsByModId(id),
      getSession(),
      getModMedia(id),
      db ? db.select({ count: sql<number>`count(*)::int` }).from(bugReports).where(and(eq(bugReports.betaModId, id), eq(bugReports.status, "open"))) : [],
    ]);
  if (!mod) notFound();

  const isPromoted = mod.status === "promoted";
  const readOnly = isPromoted || mod.status === "abandoned" || Boolean(mod.hiddenAt);
  const isOwner = session?.userId === mod.ownerId;
  const latestBuild = builds[0] ?? null;
  const myVote =
    !isOwner && session ? await getMyReadyVote(id, session.userId) : null;

  const pilotLimits = readPilotLimits();
  const uploadPermission = session
    ? await getUploadPermission(session.userId, pilotLimits)
    : ({ allowed: false, message: "Sign in to upload." } as const);
  const maxArchiveBytes = effectiveArchiveLimit(pilotLimits, MAX_UPLOAD_BYTES);

  const openBugs = bugCounts[0]?.count ?? 0;
  const following = session && db ? Boolean((await db.select({ id: modFollows.betaModId }).from(modFollows).where(and(eq(modFollows.betaModId, mod.id), eq(modFollows.userId, session.userId))).limit(1))[0]) : false;
  const gallery = media.map(({ id, width, height, caption, isHero, position }) => ({ id, width, height, caption, isHero, position }));

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

      {feedback && <p role="alert" className="mb-5 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{feedback.slice(0, 300)}</p>}
      {readOnly && !isPromoted && <p className="mb-5 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--text-soft)]">{mod.hiddenAt ? "This mod is hidden while it is under review." : "This beta is archived. New uploads and feedback are closed."}</p>}

      {isPromoted && (
        <section className="mb-5 flex flex-col gap-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-200">Released on Nexus</p>
            <p className="mt-1 text-xs leading-5 text-emerald-100/70">
              Testing is closed. This beta page is kept for reference.
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
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3"><StatusBadge status={mod.status} /><p className="eyebrow">{mod.game}</p></div>
            <h1 className="mt-3 break-words text-3xl font-semibold tracking-[-0.035em] text-[var(--text)] sm:text-4xl">{mod.title}</h1>
            {mod.description && (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">
                {modExcerpt(mod.description, 180)}
              </p>
            )}
          </div>
          <div className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--surface-soft)] p-4" aria-label="Latest build download">
            {latestBuild ? (
              <>
                <p className="text-xs text-[var(--muted)]">
                  Latest build <span className="ml-1 font-medium text-[var(--text-soft)]">{latestBuild.versionLabel}</span>
                </p>
                <Link href={`/files/${latestBuild.id}`} className="button-primary mt-3 w-full">
                  <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Download build
                </Link>
                <ContextHelp title="Malware scan passed" description={SCAN_HELP} className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--success)]">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Malware scan passed
                </ContextHelp>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Scanned before sharing. Compatibility still needs testing.
                </p>
              </>
            ) : (
              <p className="text-sm leading-6 text-[var(--muted)]">No test build uploaded yet.</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 border-t border-[var(--line)] px-5 py-4 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
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
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Tags">
                {mod.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-sm border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1 text-xs font-medium text-[var(--text-soft)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {isOwner && !readOnly && (
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
        className="mt-4 flex items-center gap-4 overflow-x-auto border-b border-[var(--line)] py-1 sm:gap-5"
      >
        <span className="hidden shrink-0 text-xs text-[var(--muted)] sm:inline">On this page</span>
        {SECTION_LINKS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-[var(--text-soft)] underline-offset-4 transition-colors hover:text-[var(--accent)] hover:underline"
          >
            <item.icon aria-hidden="true" focusable="false" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>{item.label}
            {item.href === "#files" && builds.length > 0 ? ` ${builds.length}` : ""}
            {item.href === "#bugs" && openBugs > 0 ? ` ${openBugs}` : ""}</span>
          </a>
        ))}
      </nav>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section id="overview" className="min-w-0 scroll-mt-24 border-b border-[var(--line)] pb-8 lg:col-start-1 lg:row-start-1">
          <h2 className="sr-only">Overview</h2>
          {media.length > 0 && (
            <div className="mb-6">
              <ModGallery key={gallery.find((image) => image.isHero)?.id ?? mod.id} media={gallery} title={mod.title} />
            </div>
          )}
          {mod.description ? (
            <Markdown>{mod.description}</Markdown>
          ) : (
            <EmptyCopy>No description has been added yet.</EmptyCopy>
          )}
        </section>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <section id="testing" className="panel scroll-mt-24 p-5" aria-labelledby="testing-heading">
            <SectionHeading id="testing-heading" title="Testing feedback" description="Readiness votes summarize testing of the latest build. Earlier votes stay in testing history and do not count as approval of a new build." icon={ClipboardCheck} compact />
            {latestBuild ? (
              <>
                <p className="mt-1 text-xs text-[var(--muted)]">For build {latestBuild.versionLabel}</p>
                <h3 className="sr-only">Tester verdicts</h3>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs text-[var(--muted)]">
                      <ContextHelp
                        title="Ready votes"
                        description="Testers who consider this build ready for release based on their testing. These votes apply only to this build and do not guarantee compatibility."
                        className="inline-flex items-center gap-1.5"
                      >
                        <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />Ready
                      </ContextHelp>
                    </dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{tally.ready}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">
                      <ContextHelp
                        title="Not ready votes"
                        description="Testers who think this build needs more work before release. Bug reports provide details about the problems they found."
                        className="inline-flex items-center gap-1.5"
                      >
                        <Wrench aria-hidden="true" className="h-3.5 w-3.5" />Not ready
                      </ContextHelp>
                    </dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{tally.total - tally.ready}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                  {tally.total > 0
                    ? `${tally.total} ${tally.total === 1 ? "tester has" : "testers have"} voted on this build.`
                    : "No votes for this build yet."}
                </p>

                {readOnly ? (
                  <p className="mt-4 text-xs text-[var(--muted)]">Voting is closed.</p>
                ) : isOwner ? (
                  <p className="mt-4 text-xs text-[var(--muted)]">Authors cannot vote on their own builds.</p>
                ) : session ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <form action={voteReady.bind(null, mod.id, latestBuild.id, true)}>
                      <button
                        type="submit"
                        aria-pressed={myVote === true}
                        className={myVote === true ? voteActiveClass : voteIdleClass}
                      >
                        <CircleCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        Ready
                      </button>
                    </form>
                    <form action={voteReady.bind(null, mod.id, latestBuild.id, false)}>
                      <button
                        type="submit"
                        aria-pressed={myVote === false}
                        className={myVote === false ? voteActiveClass : voteIdleClass}
                      >
                        <Wrench aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
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
                No build has been uploaded. Downloads and voting open with the first build.
              </p>
            )}
            {!isOwner && !readOnly && <div className="mt-5 border-t border-[var(--line)] pt-5">
              <h3 aria-label="Follow this mod" className="flex items-center gap-2 text-sm font-semibold">
                <ContextHelp
                  title="Follow this mod"
                  description="Following adds this mod to your Following page and gives you notifications here for new builds, bugs marked fixed, and its release on Nexus. Use the follow button below to change your choice."
                  label="About following this mod"
                  className="inline-flex text-[var(--muted)]"
                >
                  <Bell aria-hidden="true" className="h-4 w-4" />
                </ContextHelp>Follow this mod
              </h3>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Get a notification here for new builds, reported fixes, and release on Nexus.</p>
              {session ? <form action={setFollow.bind(null, mod.id, !following)}><button className="button-secondary mt-3 w-full">{following ? "Unfollow mod" : "Follow mod"}</button></form> : <Link href="/login" className="button-secondary mt-3 w-full">Sign in to follow</Link>}
            </div>}
            {latestBuild && !readOnly && <TestingChecklist key={latestBuild.id} versionLabel={latestBuild.versionLabel} />}
          </section>
          {session && <ReportContentForm modId={mod.id} />}
        </aside>

        <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-2">
          {isOwner && !readOnly && <details className="panel p-5 sm:p-7">
            <summary className="cursor-pointer text-base font-semibold text-[var(--text)]">Screenshots and cover image</summary>
            <div className="mt-5"><ModMediaManager betaModId={mod.id} media={gallery} uploadPermission={uploadPermission} cloudPilot={isCloudPilot()} /></div>
          </details>}

          <section id="files" className="scroll-mt-24 border-b border-[var(--line)] pb-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading title="Test builds" description="Downloadable versions uploaded by the author, with the newest build first. Use the matching version when reporting a bug; readiness votes apply to the latest build." icon={FileArchive} />
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
                        <ContextHelp
                          title={`Build ${build.versionLabel}`}
                          description="A versioned mod archive uploaded by the author. Check its changelog and the mod's requirements before installing, and use the Download link to get the file."
                          label={`About build ${build.versionLabel}`}
                          className="inline-flex text-[var(--accent)]"
                        >
                          <FileArchive className="h-4 w-4" aria-hidden="true" />
                        </ContextHelp>
                        <h3 className="font-semibold text-[var(--text)]">
                          {build.versionLabel}
                        </h3>
                        {index === 0 && (
                          <span className="rounded-sm border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-strong)]">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-[var(--muted)]">
                        Uploaded {formatDate(build.uploadedAt)}
                      </p>
                      {build.changelog && (
                        <div className="mt-3"><Markdown>{build.changelog}</Markdown></div>
                      )}
                      <ContextHelp title="Malware scan passed" description={SCAN_HELP} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Malware scan passed
                      </ContextHelp>
                    </div>
                    <Link href={`/files/${build.id}`} className="button-secondary shrink-0">
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download
                    </Link>
                  </article>
                ))}
              </div>
            )}

            {isOwner && !readOnly && (
              <details open={builds.length === 0} className="mt-5 rounded-md border border-[var(--line)] bg-[var(--surface-soft)]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--text)] marker:hidden">
                  {builds.length === 0 ? "Upload the first build" : "Upload a new build"}
                </summary>
                <div className="border-t border-[var(--line)] p-4 sm:p-5">
                  {uploadPermission.allowed ? (
                    <BuildUploadForm betaModId={mod.id} maxBytes={maxArchiveBytes} zipOnly={isCloudPilot()} />
                  ) : (
                    <p className="text-sm text-[var(--text-soft)]">{uploadPermission.message}</p>
                  )}
                </div>
              </details>
            )}
          </section>

          <section id="requirements" className="scroll-mt-24 border-b border-[var(--line)] pb-8">
            <SectionHeading title="Requirements" description="Other mods or tools the author says this mod needs. Check their installation instructions before testing; Beta Mods does not verify these dependencies." icon={ListChecks} />
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
                    {isOwner && !readOnly && (
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

            {isOwner && !readOnly && (
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

          <BugReports betaModId={mod.id} builds={builds} viewerId={session?.userId} isOwner={isOwner} readOnly={readOnly} uploadPermission={uploadPermission} filters={{ bugStatus, bugBuild, bugPage }} />

          {isOwner && !readOnly && (
            <section className="border-t border-[var(--line)] pt-8">
              <SectionHeading title="Publish on Nexus Mods" description="Download a release package to upload to Nexus Mods yourself. Confirming the live Nexus URL closes testing and makes this beta page read-only; downloading the package alone does not publish it." icon={PackageCheck} />
              <p className="mt-4 text-sm leading-6 text-[var(--text-soft)]">
                Download the latest build, description, requirements, and screenshots as a package to upload to Nexus Mods. Add the Nexus page URL here once it is published.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                {latestBuild ? <a href={`/mods/${mod.id}/promotion/download`} className="button-secondary">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download release package
                </a> : <a href="#files" className="button-secondary">Upload a build to create a release package</a>}
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

      </div>
    </main>
  );
}

function EmptyCopy({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
      {children}
    </p>
  );
}

const voteIdleClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-soft)] px-2 text-xs font-semibold text-[var(--text-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]";
const voteActiveClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent)] px-2 text-xs font-semibold text-[var(--accent-contrast)]";
