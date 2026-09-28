import Link from "next/link";
import { Ban, Gauge, ShieldAlert, Users } from "lucide-react";

import ApproveUploaderForm from "@/components/approve-uploader-form";
import UploadSwitchForm from "@/components/upload-switch-form";
import { requireAdmin } from "@lib/access";
import { revokeUploader } from "@lib/admin";
import { formatDate } from "@lib/format";
import { formatBytes, readAdminEmails, readPilotLimits } from "@lib/pilot";
import { storedObjectInventory } from "@lib/storage";
import {
  getStorageUsage,
  isUploadsEnabled,
  listPilotAccounts,
} from "@lib/storage-usage";

export const dynamic = "force-dynamic";

const card =
  "rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900";
const heading =
  "mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400";

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
  const adminCount = readAdminEmails().size;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Pilot control
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as {viewer.email ?? viewer.userId}. These caps are enforced
          by the app itself — Cloudflare budget alerts are warnings, not limits.
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
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {uploadsEnabled
            ? "Open — approved uploaders can add builds."
            : "Disabled — every new upload is refused right now."}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The switch takes effect on the next request. Builds already stored
          stay listed and keep downloading.
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
          <p className="text-sm text-red-600 dark:text-red-400">
            Usage is unknown, so uploads are being refused. That is the
            fail-closed behaviour, not a bug — check the database connection.
          </p>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  Stored
                </dt>
                <dd className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {formatBytes(usage.storedBytes)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  Reserved (in flight)
                </dt>
                <dd className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {formatBytes(usage.reservedBytes)}
                  <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    {usage.heldReservations} held
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  Total / cap
                </dt>
                <dd
                  className={`text-xl font-semibold ${
                    usage.totalBytes > limits.maxTotalBytes
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-950 dark:text-zinc-50"
                  }`}
                >
                  {formatBytes(usage.totalBytes)}
                  <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    of {formatBytes(limits.maxTotalBytes)}
                  </span>
                </dd>
              </div>
            </dl>

            {usage.perUser.length > 0 && (
              <ul className="mt-5 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {usage.perUser.map((row) => (
                  <li
                    key={row.userId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">
                      {row.displayName ?? row.userId}
                      {row.reservedBytes > 0 && (
                        <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                          +{formatBytes(row.reservedBytes)} in flight
                        </span>
                      )}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {formatBytes(row.storedBytes)} /{" "}
                      {formatBytes(limits.maxBytesPerTester)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <p className="mt-5 border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {storedBytes === null
            ? "Bucket listing unavailable — the R2 driver is not active here, or the listing failed."
            : `The bucket holds ${formatBytes(storedBytes)} across ${storedObjects?.length ?? 0} object(s). The ${formatBytes(limits.maxTotalBytes)} application cap is the only thing keeping this inside the free allowance.`}
        </p>
      </section>

      {/* Allowlist */}
      <section className={card}>
        <h2 className={heading}>
          <Users className="h-4 w-4" />
          Approved uploaders
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {limits.mode === "on"
            ? `Pilot mode is ON — only the ${approved.length} approved account(s) below can upload, out of ${limits.maxApprovedUploaders} allowed. Everyone else is refused.`
            : "Pilot mode is OFF — the allowlist is not consulted, and every mod owner can upload."}
        </p>

        {approved.length > 0 ? (
          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {approved.map((account) => (
              <li
                key={account.userId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {account.displayName}
                  </p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {account.email ?? "no email"} · approved{" "}
                    {formatDate(account.approvedAt)}
                    {account.approvedBy ? ` by ${account.approvedBy}` : ""}
                  </p>
                </div>
                <form action={revokeUploader.bind(null, account.userId)}>
                  <button
                    type="submit"
                    className="flex items-center gap-1 text-xs text-zinc-500 underline-offset-4 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            Nobody is approved yet
            {limits.mode === "on"
              ? ", so nobody can upload. That is the intended starting state."
              : "."}
          </p>
        )}

        {limits.mode === "on" && approved.length < limits.maxApprovedUploaders && (
          <ApproveUploaderForm />
        )}
      </section>

      <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">
        Admin identities come from <code>ADMIN_EMAILS</code> (
        {adminCount === 0 ? "unset" : `${adminCount} configured`}); changing it
        needs a restart. <Link href="/dashboard">Back to dashboard</Link>
      </p>
    </main>
  );
}
