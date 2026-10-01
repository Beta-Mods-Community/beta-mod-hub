import Link from "next/link";
import { Bug } from "lucide-react";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@lib/db";
import { betaMods, bugReports, builds as buildTable, users } from "@/db/schema";
import { bugAttachments, bugReportWorkflow } from "@/db/feedback-schema";
import { respondToBugReport, retestBugReport } from "@lib/feedback";
import { formatDate } from "@lib/format";
import { formatBytes, isCloudPilot } from "@lib/pilot";
import { canReadAttachment } from "@lib/feedback-policy";
import { getReputationHistoryByUserIds } from "@lib/dal";
import { computeReputation } from "@lib/reputation";
import BugReportForm from "./bug-report-form";
import AttachmentRemoval from "./attachment-removal";
import PrivateAttachmentLink from "./private-attachment-link";
import RetestNotice from "./retest-notice";
import SeverityBadge from "./severity-badge";
import ReportStatusBadge from "./report-status-badge";
import ReputationBadge from "./reputation-badge";
import SectionHeading from "./section-heading";

type Props = {
  betaModId: string;
  builds: { id: string; versionLabel: string }[];
  viewerId?: string;
  isOwner: boolean;
  readOnly: boolean;
  uploadPermission: { allowed: true } | { allowed: false; message: string };
  filters?: { bugStatus?: string; bugBuild?: string; bugPage?: string };
};

export default async function BugReports({ betaModId, builds, viewerId, isOwner, readOnly, uploadPermission, filters = {} }: Props) {
  if (!db) return <section id="bugs" className="scroll-mt-24"><SectionHeading title="Bug reports" description="Problems testers found in a specific build, with severity, reproduction steps, and author responses. Attachments are private to the reporter and mod author." icon={Bug} /><p className="mt-4 text-sm text-[var(--muted)]">Reports are temporarily unavailable.</p></section>;
  const status = ["open", "acknowledged", "fixed"].includes(filters.bugStatus ?? "") ? filters.bugStatus as "open" | "acknowledged" | "fixed" : undefined;
  const buildId = builds.some(build => build.id === filters.bugBuild) ? filters.bugBuild : undefined;
  const parsedPage = Number(filters.bugPage ?? "1");
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10000) : 1;
  const where = and(eq(bugReports.betaModId, betaModId), status ? eq(bugReports.status, status) : undefined, buildId ? eq(bugReports.buildId, buildId) : undefined);
  const [reports, [totalRow]] = await Promise.all([
    db.select({ report: bugReports, workflow: bugReportWorkflow, reporterName: users.displayName, buildVersion: buildTable.versionLabel, ownerId: betaMods.ownerId })
      .from(bugReports).innerJoin(betaMods, eq(betaMods.id, bugReports.betaModId))
      .innerJoin(users, eq(users.id, bugReports.reporterId)).innerJoin(buildTable, eq(buildTable.id, bugReports.buildId))
      .leftJoin(bugReportWorkflow, eq(bugReportWorkflow.reportId, bugReports.id))
      .where(where).orderBy(desc(bugReports.createdAt), desc(bugReports.id)).limit(20).offset((page - 1) * 20),
    db.select({ count: sql<number>`count(*)::int` }).from(bugReports).where(where),
  ]);
  const privateReportIds = reports.filter(row => canReadAttachment(viewerId, row.report.reporterId, row.ownerId)).map(row => row.report.id);
  const [attachments, reputation] = await Promise.all([
    privateReportIds.length ? db.select({ id: bugAttachments.id, reportId: bugAttachments.reportId, filename: bugAttachments.filename, sizeBytes: bugAttachments.sizeBytes })
      .from(bugAttachments).where(and(inArray(bugAttachments.reportId, privateReportIds), eq(bugAttachments.scanState, "clean"))) : [],
    getReputationHistoryByUserIds([...new Set(reports.map(row => row.report.reporterId))]),
  ]);
  const total = totalRow?.count ?? 0;
  const hasFilters = Boolean(status || buildId);
  const pageUrl = (next: number) => {
    const query = new URLSearchParams({ bugPage: String(next) });
    if (status) query.set("bugStatus", status);
    if (buildId) query.set("bugBuild", buildId);
    return `/mods/${betaModId}?${query}#bugs`;
  };
  return <section id="bugs" className="scroll-mt-24">
    <div className="flex flex-wrap items-end justify-between gap-3"><SectionHeading title="Bug reports" description="Problems testers found in a specific build, with severity, reproduction steps, and author responses. Attachments are private to the reporter and mod author." icon={Bug} /><span className="text-sm text-[var(--muted)]">{total} {hasFilters ? "matching " : ""}{total === 1 ? "report" : "reports"}</span></div>
    {(total > 0 || hasFilters) && <form key={JSON.stringify([status ?? "", buildId ?? ""])} method="get" action={`/mods/${betaModId}#bugs`} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="text-xs font-medium">Status<select name="bugStatus" defaultValue={status ?? ""} className="field mt-1"><option value="">All statuses</option><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="fixed">Fixed</option></select></label>
      <label className="text-xs font-medium">Affected build<select name="bugBuild" defaultValue={buildId ?? ""} className="field mt-1"><option value="">All builds</option>{builds.map(build => <option key={build.id} value={build.id}>{build.versionLabel}</option>)}</select></label>
      <button className="button-secondary" type="submit">Filter reports</button>
    </form>}
    {hasFilters && <Link href={`/mods/${betaModId}#bugs`} className="mt-3 inline-block text-sm text-[var(--accent)] underline underline-offset-4">Clear filters</Link>}
    <div className="mt-5 space-y-4">{reports.length === 0 ? <div className="text-sm leading-6 text-[var(--muted)]">
      <p>{total > 0 ? "There are no reports on this page." : hasFilters ? "No reports match these filters." : "No bug reports yet."}</p>
      {total > 0 && <Link href={pageUrl(1)} className="mt-2 inline-block text-[var(--accent)] underline underline-offset-4">Go to the first page</Link>}
    </div> : reports.map(({ report, workflow, reporterName, buildVersion }) => {
      const history = reputation.get(report.reporterId);
      const reportAttachments = attachments.filter(attachment => attachment.reportId === report.id);
      return <article id={`report-${report.id}`} key={report.id} className="scroll-mt-24 rounded-md border border-[var(--line)] bg-[var(--surface-soft)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={report.severity} /><ReportStatusBadge status={report.status} /><span className="text-xs text-[var(--muted)]">Build {buildVersion}</span></div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{report.description}</p>
        {report.reproSteps && <div className="mt-3"><h3 className="text-xs font-semibold text-[var(--muted)]">Steps to reproduce</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{report.reproSteps}</p></div>}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]"><Link href={`/users/${report.reporterId}`} className="text-[var(--text-soft)] hover:underline">{reporterName}</Link>{history && <ReputationBadge score={computeReputation(history)} />}<span>· {formatDate(report.createdAt)}</span></div>
        {reportAttachments.map(attachment => (
          <div key={attachment.id} className="mt-3 flex flex-wrap items-start gap-3 rounded border border-[var(--line)] p-3">
            <PrivateAttachmentLink attachmentId={attachment.id} filename={attachment.filename} sizeLabel={formatBytes(attachment.sizeBytes)} />
            {!readOnly && <AttachmentRemoval attachmentId={attachment.id} filename={attachment.filename} />}
          </div>
        ))}
        {workflow?.authorResponse && <div className="mt-4 border-l-2 border-[var(--accent)] pl-4"><p className="text-xs font-semibold">Author response{workflow.respondedAt ? ` · ${formatDate(workflow.respondedAt)}` : ""}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-soft)]">{workflow.authorResponse}</p></div>}
        {workflow && <RetestNotice status={workflow.retestStatus} buildVersion={workflow.retestBuildId ? builds.find(build => build.id === workflow.retestBuildId)?.versionLabel ?? "unavailable" : undefined} notes={workflow.retestNotes} />}
        {isOwner && !readOnly && <details className="mt-4 border-t border-[var(--line)] pt-3"><summary className="cursor-pointer text-sm font-semibold">Respond or update status</summary><form action={respondToBugReport} className="mt-3 space-y-3">
          <input name="reportId" type="hidden" value={report.id} /><label className="block text-xs">Status<select name="status" defaultValue={report.status} className="field mt-1"><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="fixed">Fixed</option></select></label>
          <label className="block text-xs">Author response<textarea name="response" required minLength={5} maxLength={2000} rows={3} defaultValue={workflow?.authorResponse ?? ""} className="field mt-1" placeholder="Explain the cause, workaround, or fix." /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requestRetest" />Ask the reporter to retest the latest build</label><p className="text-xs text-[var(--muted)]">Marking fixed also requests a retest.</p><button type="submit" className="button-secondary">Save response</button>
        </form></details>}
        {viewerId === report.reporterId && !readOnly && builds.length > 0 && <details className="mt-4 border-t border-[var(--line)] pt-3"><summary className="cursor-pointer text-sm font-semibold">Record your retest</summary><form action={retestBugReport} className="mt-3 space-y-3">
          <input type="hidden" name="reportId" value={report.id} /><label className="block text-xs">Build you retested<select name="buildId" defaultValue={builds[0]?.id} className="field mt-1">{builds.map(build => <option key={build.id} value={build.id}>{build.versionLabel}</option>)}</select></label>
          <label className="block text-xs">Result<select name="result" className="field mt-1"><option value="resolved">The issue is resolved</option><option value="still-present">The issue is still present</option></select></label>
          <label className="block text-xs">Retest notes (optional)<textarea name="notes" maxLength={2000} rows={3} className="field mt-1" /></label><button className="button-secondary" type="submit">Save retest</button>
        </form></details>}
      </article>;
    })}</div>
    {(page > 1 || page * 20 < total) && <nav aria-label="Bug report pages" className="mt-5 flex items-center justify-between gap-4">{page > 1 ? <Link className="button-secondary" href={pageUrl(page - 1)}>Previous</Link> : <span />}<span className="text-xs text-[var(--muted)]">Page {page}</span>{page * 20 < total ? <Link className="button-secondary" href={pageUrl(page + 1)}>Next</Link> : <span />}</nav>}
    {readOnly ? <p className="mt-5 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted)]">This mod is read-only.</p> : builds.length === 0 ? <p className="mt-5 text-sm text-[var(--muted)]">Bug reporting opens after the first build is uploaded.</p> : viewerId ? <details className="mt-5 rounded-md border border-[var(--line)]"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">File a bug report</summary><div className="border-t border-[var(--line)] p-4"><BugReportForm betaModId={betaModId} builds={builds} cloudPilot={isCloudPilot()} uploadPermission={uploadPermission} /></div></details> : <p className="mt-5 text-sm"><Link className="text-[var(--accent)]" href="/login">Sign in</Link> to report a bug.</p>}
  </section>;
}
