import Link from "next/link";
import { Ban, Gauge, ShieldAlert, Users } from "lucide-react";

import ApproveUploaderForm from "@/components/approve-uploader-form";
import UploadSwitchForm from "@/components/upload-switch-form";
import ModerationPanel from "@/components/moderation-panel";
import { requireAdmin } from "@lib/access";
import { revokeUploader } from "@lib/admin";
import { formatDate } from "@lib/format";
import { formatBytes, readAdminUserIds, readPilotLimits } from "@lib/pilot";
import { storedObjectInventory } from "@lib/storage";
import {
  getStorageUsage,
  isUploadsEnabled,
  listPilotAccounts,
} from "@lib/storage-usage";

export const dynamic = "force-dynamic";

const card = "panel p-5 sm:p-6";
const heading =
  "mb-3 flex items-center gap-2 text-lg font-semibold text-text";

export default async function AdminPage() {
  const viewer = await requireAdmin();
  const limits = readPilotLimits();
  const uploadsEnabled = await isUploadsEnabled();
  const usage = await getStorageUsage();
  const approved = await listPilotAccounts();

  // The ledger is what the caps are measured against, but the bucket is what
  // actually costs money. Listing it shows what is really being paid for.
  const storedObjects = await storedObjectInventory().catch(() => null);
  const storedBytes =
    storedObjects?.reduce((total, object) => total + object.size, 0) ?? null;
  const adminCount = readAdminUserIds().size;

  return (
    <main className="site-container max-w-4xl flex-1 py-10 sm:py-12">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Site administration
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Signed in as {viewer.email ?? viewer.userId}. Manage upload access and
          the pilot&apos;s storage limits here. An upload approval does not grant
          administrator access.
        </p>
      </div>

      {/* Kill switch */}
      <section className={`${card} mb-6`}>
        <h2 className={heading}>
          <ShieldAlert className="h-4 w-4" />
          New uploads
        </h2>
        <p
          className={`text-sm font-medium ${
            uploadsEnabled
              ? "text-emerald-400"
              : "text-red-400"
          }`}
        >
          {uploadsEnabled
            ? "Enabled. Approved accounts can upload builds, screenshots and report attachments."
            : "Paused. New file uploads are blocked."}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted">
          This takes effect on the next upload request. Existing builds remain
          available to download.
        </p>
        <UploadSwitchForm enabled={uploadsEnabled} />
      </section>

      {/* Storage usage */}
      <section className={`${card} mb-6`}>
        <h2 className={heading}>
          <Gauge className="h-4 w-4" />
          Storage
        </h2>

        {!usage ? (
          <p className="text-sm leading-6 text-red-400">
            Uploads are paused because storage usage could not be checked.
            Check the database connection.
          </p>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">
                  Stored
                </dt>
                <dd className="text-xl font-semibold text-text">
                  {formatBytes(usage.storedBytes)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  Reserved for uploads
                </dt>
                <dd className="text-xl font-semibold text-text">
                  {formatBytes(usage.reservedBytes)}
                  <span className="ml-1 text-xs font-normal text-muted">
                    {usage.heldReservations} held
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  Total / cap
                </dt>
                <dd
                  className={`text-xl font-semibold ${
                    usage.totalBytes > limits.maxTotalBytes
                      ? "text-red-400"
                      : "text-text"
                  }`}
                >
                  {formatBytes(usage.totalBytes)}
                  <span className="ml-1 text-xs font-normal text-muted">
                    of {formatBytes(limits.maxTotalBytes)}
                  </span>
                </dd>
              </div>
            </dl>

            {usage.perUser.length > 0 && (
              <ul className="mt-5 divide-y divide-line text-sm">
                {usage.perUser.map((row) => (
                  <li
                    key={row.userId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="min-w-0 truncate text-text-soft">
                      {row.displayName ?? row.userId}
                      {row.reservedBytes > 0 && (
                        <span className="ml-2 text-xs text-amber-400">
                          +{formatBytes(row.reservedBytes)} reserved
                        </span>
                      )}
                    </span>
                    <span className="text-muted">
                      {formatBytes(row.storedBytes)} /{" "}
                      {formatBytes(limits.maxBytesPerTester)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">
          {storedBytes === null
            ? "The storage inventory is unavailable. Check the storage service before approving more uploads."
            : `The private store holds ${formatBytes(storedBytes)} across ${storedObjects?.length ?? 0} object(s). The application cap is ${formatBytes(limits.maxTotalBytes)}; provider storage, transfer and scanning limits also apply.`}
        </p>
      </section>

      {/* Allowlist */}
      <section className={card}>
        <h2 className={heading}>
          <Users className="h-4 w-4" />
          Approved uploaders
        </h2>
        <p className="text-sm leading-6 text-muted">
          {limits.mode === "on"
            ? `${approved.length} of ${limits.maxApprovedUploaders} upload approvals are in use, including any approved owner account. Approval is required for builds, screenshots and report attachments.`
            : "Pilot mode is off. Uploads do not require approval."}
        </p>
        {limits.mode === "on" && <p className="mt-2 text-sm leading-6 text-muted">
          Ask each invited tester to sign up and verify their email first, then
          approve that account below. Accounts without upload approval can still
          browse, download, submit text-only bug reports and vote on builds.
          Share the pilot access code privately; it does not replace account signup.
        </p>}

        {approved.length > 0 ? (
          <ul className="mt-4 divide-y divide-line">
            {approved.map((account) => (
              <li
                key={account.userId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {account.displayName}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {account.email ?? "no email"} · approved{" "}
                    {formatDate(account.approvedAt)}
                    {account.approvedBy ? ` by ${account.approvedBy}` : ""}
                  </p>
                </div>
                <form action={revokeUploader.bind(null, account.userId)}>
                  <button
                    type="submit"
                    className="flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3 text-sm text-text-soft hover:border-red-400 hover:text-red-400"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">
            No accounts have upload approval yet
            {limits.mode === "on"
              ? ", so new file uploads are blocked."
              : "."}
          </p>
        )}

        {limits.mode === "on" && approved.length < limits.maxApprovedUploaders && (
          <ApproveUploaderForm />
        )}
      </section>

      <ModerationPanel />
      <p className="mt-8 text-xs leading-5 text-muted">
        Admin identities come from <code>ADMIN_USER_IDS</code> (
        {adminCount === 0 ? "unset" : `${adminCount} configured`}); changing it
        needs a restart. <Link href="/dashboard" className="inline-flex min-h-11 items-center text-text-soft underline underline-offset-4 hover:text-text">Back to dashboard</Link>
      </p>
    </main>
  );
}
