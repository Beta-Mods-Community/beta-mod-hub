/**
 * Pilot-mode policy — the numbers that bound the closed beta.
 *
 * Deliberately PURE: no database, no filesystem, no `server-only`. Every limit
 * is resolved here in one place so the upload action, the admin console and the
 * unit tests can never disagree about what the caps are.
 *
 * Defaults are the pilot numbers agreed for the closed beta:
 *
 *   5    approved uploaders (testers + mods)
 *   250 MiB  per archive
 *   1.5 GiB  per tester, all of their builds
 *   8 GiB    global, everything
 *
 * Anything unparseable in the environment falls back to the default rather
 * than to "unlimited": a typo must never silently remove a cap.
 */

export const MiB = 1024 * 1024;
export const GiB = 1024 * 1024 * 1024;

export type PilotLimits = {
  /** Allowlist mode. When off, every signed-in mod owner may upload. */
  mode: "on" | "off";
  /** Hard ceiling on a single archive. */
  maxArchiveBytes: number;
  /** Hard ceiling on one tester's total stored bytes. */
  maxBytesPerTester: number;
  /** Hard ceiling on the whole pilot's total stored bytes. */
  maxTotalBytes: number;
  /** How many accounts may hold an upload approval. */
  maxApprovedUploaders: number;
  /** Upload attempts allowed per window, per tester. */
  uploadsPerWindow: number;
  windowMinutes: number;
  /** How long a presigned download URL stays valid. */
  downloadUrlTtlSeconds: number;
  /** Abandoned reservations older than this are reclaimed. */
  reservationTtlMinutes: number;
};

export const PILOT_DEFAULTS: PilotLimits = {
  mode: "off",
  maxArchiveBytes: 250 * MiB,
  maxBytesPerTester: 1536 * MiB, // 1.5 GiB
  maxTotalBytes: 8 * GiB,
  maxApprovedUploaders: 5,
  uploadsPerWindow: 10,
  windowMinutes: 60,
  downloadUrlTtlSeconds: 300,
  reservationTtlMinutes: 60,
};

type Env = Record<string, string | undefined>;

function readInt(raw: string | undefined, fallback: number, min = 1): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  return floored < min ? fallback : floored;
}

function readMode(raw: string | undefined): "on" | "off" {
  const value = (raw ?? "").trim().toLowerCase();
  if (["on", "true", "1", "yes", "enabled"].includes(value)) return "on";
  if (["off", "false", "0", "no", "disabled"].includes(value)) return "off";
  return PILOT_DEFAULTS.mode;
}

/** Resolve the effective pilot limits from the environment. */
export function readPilotLimits(env: Env = process.env): PilotLimits {
  return {
    mode: readMode(env.PILOT_MODE),
    maxArchiveBytes: readInt(
      env.PILOT_MAX_ARCHIVE_BYTES,
      PILOT_DEFAULTS.maxArchiveBytes,
    ),
    maxBytesPerTester: readInt(
      env.PILOT_MAX_BYTES_PER_TESTER,
      PILOT_DEFAULTS.maxBytesPerTester,
    ),
    maxTotalBytes: readInt(env.PILOT_MAX_TOTAL_BYTES, PILOT_DEFAULTS.maxTotalBytes),
    maxApprovedUploaders: readInt(
      env.PILOT_MAX_UPLOADERS,
      PILOT_DEFAULTS.maxApprovedUploaders,
    ),
    uploadsPerWindow: readInt(
      env.PILOT_UPLOADS_PER_WINDOW,
      PILOT_DEFAULTS.uploadsPerWindow,
    ),
    windowMinutes: readInt(
      env.PILOT_UPLOAD_WINDOW_MINUTES,
      PILOT_DEFAULTS.windowMinutes,
    ),
    downloadUrlTtlSeconds: readInt(
      env.DOWNLOAD_URL_TTL_SECONDS,
      PILOT_DEFAULTS.downloadUrlTtlSeconds,
    ),
    reservationTtlMinutes: readInt(
      env.PILOT_RESERVATION_TTL_MINUTES,
      PILOT_DEFAULTS.reservationTtlMinutes,
    ),
  };
}

/**
 * Explicit, immutable account IDs. Email ownership is never inferred.
 */
export function readAdminUserIds(env: Env = process.env): Set<string> {
  return new Set(
    (env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)),
  );
}

/**
 * The per-file ceiling actually applied: the pilot limit, but never above the
 * absolute hard ceiling the upload action enforces regardless of configuration.
 */
export function effectiveArchiveLimit(
  limits: PilotLimits,
  hardCeiling: number,
): number {
  return Math.max(0, Math.min(hardCeiling, limits.maxArchiveBytes));
}

// --- The cap decision -------------------------------------------------------

export type ReservationDenial =
  | "archive-too-large"
  | "tester-cap"
  | "global-cap"
  | "rate-limited"
  | "usage-unavailable";

export type ReservationVerdict =
  | { ok: true }
  | { ok: false; reason: ReservationDenial; message: string };

export type ReservationFacts = {
  /** Bytes already committed (promoted and stored). */
  storedBytes: number;
  /** Bytes held by in-flight uploads that have not settled yet. */
  reservedBytes: number;
  /** Bytes this tester already has committed. */
  testerStoredBytes: number;
  /** Bytes this tester already has in flight. */
  testerReservedBytes: number;
  /** Attempts this tester has made inside the rate-limit window. */
  attemptsInWindow: number;
  requestedBytes: number;
  limits: PilotLimits;
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  // One decimal below 10, none above — enough to read a cap without noise.
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Decide whether an upload may proceed. Pure and total: every rejection reason
 * is explicit so the caller can surface an honest message, and a caller that
 * cannot establish usage passes `usageKnown: false` and is refused.
 *
 * Order matters. The rate limit is checked first because it is the cheapest
 * way to stop a runaway client, then the per-file ceiling, then the caps.
 */
export function evaluateReservation(
  facts: ReservationFacts & { usageKnown?: boolean },
): ReservationVerdict {
  const { limits } = facts;

  if (facts.usageKnown === false) {
    return {
      ok: false,
      reason: "usage-unavailable",
      message:
        "Storage usage could not be determined, so uploads are paused. Try again shortly.",
    };
  }

  if (facts.attemptsInWindow >= limits.uploadsPerWindow) {
    return {
      ok: false,
      reason: "rate-limited",
      message: `Upload limit reached — ${plural(
        limits.uploadsPerWindow,
        "upload",
      )} per ${plural(limits.windowMinutes, "minute")}. Try again later.`,
    };
  }

  if (facts.requestedBytes > limits.maxArchiveBytes) {
    return {
      ok: false,
      reason: "archive-too-large",
      message: `File is too large — the max archive size is ${formatBytes(
        limits.maxArchiveBytes,
      )}.`,
    };
  }

  const totalAfter =
    facts.storedBytes + facts.reservedBytes + facts.requestedBytes;
  const testerAfter =
    facts.testerStoredBytes +
    facts.testerReservedBytes +
    facts.requestedBytes;

  if (testerAfter > limits.maxBytesPerTester) {
    return {
      ok: false,
      reason: "tester-cap",
      message: `That would put you over the ${formatBytes(
        limits.maxBytesPerTester,
      )} per-tester limit. Delete an older build to free space.`,
    };
  }

  if (totalAfter > limits.maxTotalBytes) {
    return {
      ok: false,
      reason: "global-cap",
      message: `The pilot is at its ${formatBytes(
        limits.maxTotalBytes,
      )} storage limit, so new uploads are paused. Contact the site owner.`,
    };
  }

  return { ok: true };
}
