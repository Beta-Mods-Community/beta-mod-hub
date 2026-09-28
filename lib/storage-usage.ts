import "server-only";

import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";

import { db } from "./db";
import {
  evaluateReservation,
  type PilotLimits,
  type ReservationVerdict,
} from "./pilot";
import {
  appSettings,
  pilotAccounts,
  storageReservations,
  users,
} from "../db/schema";

/**
 * The byte ledger behind the pilot's storage caps.
 *
 * ## Why a ledger at all
 *
 * The caps (per archive, per tester, global) are only real if two uploads that
 * arrive at the same instant cannot both see the same free space and both
 * proceed. Reading the ledger, checking it and writing the reservation as three
 * separate statements has exactly that race. So the whole read-check-write runs
 * inside ONE transaction that first takes a transaction-scoped Postgres
 * advisory lock: concurrent reservation transactions queue up behind each
 * other, and in READ COMMITTED the loser re-reads the ledger *after* the winner
 * commits, so it sees the new row.
 *
 * `pg_advisory_xact_lock` (not the session-scoped variant) is deliberate: it is
 * released automatically at COMMIT or ROLLBACK, so a crashed request cannot
 * wedge the ledger shut, and it is safe behind Neon's pooled pgbouncer, which
 * pins a server connection only for the life of the transaction.
 *
 * ## Lifecycle
 *
 *   reserveStorage()   -> state 'held'     counted against the caps
 *   markReservationStored() -> 'stored'    counted against the caps
 *   releaseReservation()    -> 'released'  NOT counted; kept as attempt history
 *
 * Deleting a build (or the mod that owns it) cascades the reservation row away,
 * which releases its bytes without anyone having to remember to do it. The
 * matching R2 object deletion is the caller's job — see deleteBetaMod.
 */

/** Key in app_settings for the "no new uploads" kill switch. */
export const UPLOADS_ENABLED_KEY = "uploads_enabled";

/**
 * Fixed advisory-lock key. Any value works as long as it is a constant and does
 * not collide with another lock in this database; it must never be derived from
 * a user id, or two uploads would stop excluding each other.
 */
const RESERVATION_LOCK_KEY = "7284119033";

/** Every byte count crosses this boundary — Postgres may hand back a string. */
function bytes(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type UsageSnapshot = {
  /** Bytes in final storage, counted from settled reservations. */
  storedBytes: number;
  /** Bytes held by uploads that are still in flight. */
  reservedBytes: number;
  /** storedBytes + reservedBytes — what the global cap is measured against. */
  totalBytes: number;
  heldReservations: number;
  perUser: Array<{
    userId: string;
    displayName: string | null;
    email: string | null;
    storedBytes: number;
    reservedBytes: number;
  }>;
};

/** Whole-pilot usage, for the admin console. Null when the ledger is unreadable. */
export async function getStorageUsage(): Promise<UsageSnapshot | null> {
  if (!db) return null;

  try {
    const [totals] = await db
      .select({
        stored: sql<string | number>`coalesce(sum(${storageReservations.bytes}) filter (where ${storageReservations.state} = 'stored'), 0)`,
        reserved: sql<string | number>`coalesce(sum(${storageReservations.bytes}) filter (where ${storageReservations.state} = 'held'), 0)`,
        held: sql<string | number>`count(*) filter (where ${storageReservations.state} = 'held')`,
      })
      .from(storageReservations);

    const perUser = await db
      .select({
        userId: storageReservations.userId,
        displayName: users.displayName,
        email: users.email,
        stored: sql<string | number>`coalesce(sum(${storageReservations.bytes}) filter (where ${storageReservations.state} = 'stored'), 0)`,
        reserved: sql<string | number>`coalesce(sum(${storageReservations.bytes}) filter (where ${storageReservations.state} = 'held'), 0)`,
      })
      .from(storageReservations)
      .innerJoin(users, eq(users.id, storageReservations.userId))
      .where(
        inArray(storageReservations.state, ["held", "stored"]),
      )
      .groupBy(storageReservations.userId, users.displayName, users.email)
      .orderBy(desc(sql`sum(${storageReservations.bytes})`));

    const storedBytes = bytes(totals?.stored);
    const reservedBytes = bytes(totals?.reserved);

    return {
      storedBytes,
      reservedBytes,
      totalBytes: storedBytes + reservedBytes,
      heldReservations: bytes(totals?.held),
      perUser: perUser.map((row) => ({
        userId: row.userId,
        displayName: row.displayName,
        email: row.email,
        storedBytes: bytes(row.stored),
        reservedBytes: bytes(row.reserved),
      })),
    };
  } catch {
    // The console shows "unknown" rather than a wrong number.
    return null;
  }
}

export type ReservationResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: string; message: string };

/**
 * Take a byte reservation for an upload that is about to start.
 *
 * Returns the reservation id, which the caller MUST either settle
 * (markReservationStored) or release. Anything else leaks capacity.
 *
 * Every rejection is a deliberate refusal: including when the ledger itself
 * cannot be read, because a cap that cannot be evaluated is not a cap.
 */
export async function reserveStorage(input: {
  userId: string;
  bytes: number;
  limits: PilotLimits;
}): Promise<ReservationResult> {
  if (!db) {
    return {
      ok: false,
      reason: "usage-unavailable",
      message:
        "The database isn't configured yet — uploads are paused until it is.",
    };
  }
  if (!Number.isInteger(input.bytes) || input.bytes <= 0) {
    return {
      ok: false,
      reason: "archive-too-large",
      message: "Choose a non-empty file to upload.",
    };
  }

  const { limits } = input;
  const windowStart = new Date(Date.now() - limits.windowMinutes * 60_000);
  const staleBefore = new Date(Date.now() - limits.reservationTtlMinutes * 60_000);
  // Released rows are only history; a week of it is plenty for the rate limit
  // to work, and the table stays small enough to scan.
  const historyBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    return await db.transaction(async (tx) => {
      // 1. Serialise. Everything below is only safe because of this line.
      await tx.execute(
        sql`select pg_advisory_xact_lock(${RESERVATION_LOCK_KEY}::bigint)`,
      );

      // 2. Reclaim first, so a crashed request cannot hold the cap hostage
      //    forever and abandoned rows do not skew the totals.
      await tx
        .delete(storageReservations)
        .where(
          and(
            eq(storageReservations.state, "held"),
            lt(storageReservations.createdAt, staleBefore),
          ),
        );
      await tx
        .delete(storageReservations)
        .where(
          and(
            eq(storageReservations.state, "released"),
            lt(storageReservations.createdAt, historyBefore),
          ),
        );

      // 3. Read the ledger. In READ COMMITTED this snapshot now includes every
      //    reservation that committed while we were waiting on the lock.
      const [totals] = await tx
        .select({
          stored: sql<string | number>`coalesce(sum(${storageReservations.bytes}) filter (where ${storageReservations.state} = 'stored'), 0)`,
          reserved: sql<string | number>`coalesce(sum(${storageReservations.bytes}) filter (where ${storageReservations.state} = 'held'), 0)`,
        })
        .from(storageReservations);

      const [mine] = await tx
        .select({
          stored: sql<string | number>`coalesce(sum(${storageReservations.bytes}) filter (where ${storageReservations.state} = 'stored'), 0)`,
          reserved: sql<string | number>`coalesce(sum(${storageReservations.bytes}) filter (where ${storageReservations.state} = 'held'), 0)`,
          attempts: sql<string | number>`count(*)`,
        })
        .from(storageReservations)
        .where(
          and(
            eq(storageReservations.userId, input.userId),
            gt(storageReservations.createdAt, windowStart),
          ),
        );

      const facts = {
        storedBytes: bytes(totals?.stored),
        reservedBytes: bytes(totals?.reserved),
        testerStoredBytes: bytes(mine?.stored),
        testerReservedBytes: bytes(mine?.reserved),
        attemptsInWindow: bytes(mine?.attempts),
        requestedBytes: input.bytes,
        limits,
      };

      const verdict: ReservationVerdict = evaluateReservation(facts);
      if (!verdict.ok) {
        // Refuse WITHOUT writing a row. A rejected request is not an attempt
        // the rate limit should count, and it must not reserve anything.
        return { ok: false, reason: verdict.reason, message: verdict.message };
      }

      // 4. Take the reservation.
      const inserted = await tx
        .insert(storageReservations)
        .values({
          userId: input.userId,
          bytes: input.bytes,
          state: "held",
        })
        .returning({ id: storageReservations.id });

      const id = inserted[0]?.id;
      if (!id) {
        return {
          ok: false,
          reason: "usage-unavailable",
          message: "Could not reserve storage for this upload. Try again.",
        };
      }
      return { ok: true, reservationId: id };
    });
  } catch {
    // Fail closed: if the ledger cannot be read or written, the upload stops.
    // The reason is deliberately not surfaced — an unexpected database error
    // is an operator problem, and the user only needs to know to retry.
    return {
      ok: false,
      reason: "usage-unavailable",
      message:
        "Storage usage could not be determined, so uploads are paused. Try again shortly.",
    };
  }
}

/** Settle a held reservation against its build once the bytes are in storage. */
export async function markReservationStored(
  reservationId: string,
  buildId: string,
): Promise<void> {
  if (!db) return;
  await db
    .update(storageReservations)
    .set({ state: "stored", buildId, settledAt: new Date() })
    .where(eq(storageReservations.id, reservationId));
}

/**
 * Give the bytes back after a failed, blocked or abandoned upload. The row stays
 * as attempt history (which the rate limit counts) but stops counting against
 * the caps.
 */
export async function releaseReservation(
  reservationId: string,
): Promise<void> {
  if (!db) return;
  await db
    .update(storageReservations)
    .set({ state: "released", settledAt: new Date() })
    .where(
      and(
        eq(storageReservations.id, reservationId),
        eq(storageReservations.state, "held"),
      ),
    );
}

// --- Pilot allowlist --------------------------------------------------------

export async function listPilotAccounts(): Promise<
  Array<{
    userId: string;
    email: string | null;
    displayName: string;
    approvedAt: Date;
    approvedBy: string | null;
  }>
> {
  if (!db) return [];
  const rows = await db
    .select({
      userId: pilotAccounts.userId,
      email: users.email,
      displayName: users.displayName,
      approvedAt: pilotAccounts.approvedAt,
      approvedBy: pilotAccounts.approvedBy,
    })
    .from(pilotAccounts)
    .innerJoin(users, eq(users.id, pilotAccounts.userId))
    .orderBy(desc(pilotAccounts.approvedAt));
  return rows;
}

/** Approvals are explicit: not being in this table means "cannot upload". */
export async function isPilotUploader(userId: string): Promise<boolean> {
  if (!db) return false;
  const rows = await db
    .select({ userId: pilotAccounts.userId })
    .from(pilotAccounts)
    .where(eq(pilotAccounts.userId, userId))
    .limit(1);
  return rows.length > 0;
}

export async function countPilotAccounts(): Promise<number> {
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<string | number>`count(*)` })
    .from(pilotAccounts);
  return bytes(rows[0]?.count);
}

// --- Runtime switches -------------------------------------------------------

/**
 * Whether new uploads are allowed. A missing row reads as enabled so the site
 * never comes up frozen; only an explicit 'false' pauses uploads.
 */
export async function isUploadsEnabled(): Promise<boolean> {
  if (!db) return true;
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, UPLOADS_ENABLED_KEY))
    .limit(1);
  return rows[0]?.value !== "false";
}

export async function setUploadsEnabled(enabled: boolean): Promise<void> {
  if (!db) return;
  await db
    .insert(appSettings)
    .values({
      key: UPLOADS_ENABLED_KEY,
      value: enabled ? "true" : "false",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: enabled ? "true" : "false", updatedAt: new Date() },
    });
}

// --- Who may upload ---------------------------------------------------------

export type UploadPermission =
  | { allowed: true }
  | { allowed: false; message: string };

/**
 * The two gates that are not about size: the admin kill switch and the pilot
 * allowlist.
 *
 * The mod page calls this to decide whether to render the upload form, and
 * `uploadBuild` calls it again before doing anything — rendering a form is a
 * hint, not authorisation, so the action never relies on the page's answer.
 */
export async function getUploadPermission(
  userId: string,
  limits: PilotLimits,
): Promise<UploadPermission> {
  // The kill switch wins over everything, including who is asking.
  if (!(await isUploadsEnabled())) {
    return {
      allowed: false,
      message: "Uploads are paused right now. Please try again later.",
    };
  }

  // Allowlist: while the pilot is on, only approved accounts may upload.
  if (limits.mode === "on" && !(await isPilotUploader(userId))) {
    return {
      allowed: false,
      message:
        "Uploads are limited to approved pilot testers at the moment. Ask the site owner for an invite.",
    };
  }

  return { allowed: true };
}
