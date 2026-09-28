import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  effectiveArchiveLimit,
  evaluateReservation,
  formatBytes,
  GiB,
  MiB,
  PILOT_DEFAULTS,
  readAdminEmails,
  readPilotLimits,
  type PilotLimits,
  type ReservationFacts,
} from "../lib/pilot";

/** A permissive baseline; individual tests tighten exactly one limit. */
function limits(overrides: Partial<PilotLimits> = {}): PilotLimits {
  return { ...PILOT_DEFAULTS, ...overrides };
}

function facts(overrides: Partial<ReservationFacts> = {}): ReservationFacts {
  return {
    storedBytes: 0,
    reservedBytes: 0,
    testerStoredBytes: 0,
    testerReservedBytes: 0,
    attemptsInWindow: 0,
    requestedBytes: 100,
    limits: limits(),
    ...overrides,
  };
}

describe("readPilotLimits", () => {
  it("defaults to the agreed pilot numbers with no env at all", () => {
    const resolved = readPilotLimits({});
    assert.equal(resolved.maxArchiveBytes, 250 * MiB);
    assert.equal(resolved.maxBytesPerTester, 1536 * MiB);
    assert.equal(resolved.maxTotalBytes, 8 * GiB);
    assert.equal(resolved.maxApprovedUploaders, 5);
    assert.equal(resolved.maxBytesPerTester, 1.5 * GiB);
  });

  it("defaults pilot mode to off, so dev and e2e are unrestricted", () => {
    assert.equal(readPilotLimits({}).mode, "off");
  });

  it("reads every override from the environment", () => {
    const resolved = readPilotLimits({
      PILOT_MODE: "on",
      PILOT_MAX_ARCHIVE_BYTES: "1048576",
      PILOT_MAX_BYTES_PER_TESTER: "2097152",
      PILOT_MAX_TOTAL_BYTES: "3145728",
      PILOT_MAX_UPLOADERS: "2",
      PILOT_UPLOADS_PER_WINDOW: "4",
      PILOT_UPLOAD_WINDOW_MINUTES: "15",
      DOWNLOAD_URL_TTL_SECONDS: "60",
    });
    assert.deepEqual(resolved, {
      mode: "on",
      maxArchiveBytes: 1048576,
      maxBytesPerTester: 2097152,
      maxTotalBytes: 3145728,
      maxApprovedUploaders: 2,
      uploadsPerWindow: 4,
      windowMinutes: 15,
      downloadUrlTtlSeconds: 60,
      reservationTtlMinutes: PILOT_DEFAULTS.reservationTtlMinutes,
    });
  });

  it("accepts the usual spellings of on/off", () => {
    for (const value of ["on", "ON", "true", "1", "yes", "enabled"]) {
      assert.equal(readPilotLimits({ PILOT_MODE: value }).mode, "on", value);
    }
    for (const value of ["off", "OFF", "false", "0", "no", "disabled"]) {
      assert.equal(readPilotLimits({ PILOT_MODE: value }).mode, "off", value);
    }
  });

  it("falls back to the default cap rather than to unlimited on a typo", () => {
    // This is the whole point: a mistyped cap must never remove a limit.
    const resolved = readPilotLimits({
      PILOT_MAX_TOTAL_BYTES: "8GiB",
      PILOT_MAX_ARCHIVE_BYTES: "0",
      PILOT_MAX_UPLOADERS: "-3",
    });
    assert.equal(resolved.maxTotalBytes, 8 * GiB);
    assert.equal(resolved.maxArchiveBytes, 250 * MiB);
    assert.equal(resolved.maxApprovedUploaders, 5);
  });

  it("treats an unparseable pilot mode as off rather than as a guess", () => {
    assert.equal(readPilotLimits({ PILOT_MODE: "maybe" }).mode, "off");
  });
});

describe("readAdminEmails", () => {
  it("is empty when unset, which means no admin can get in", () => {
    assert.equal(readAdminEmails({}).size, 0);
  });

  it("normalises case, whitespace and stray commas", () => {
    const admins = readAdminEmails({
      ADMIN_EMAILS: " Owner@BetaMods.com ,second@example.com,, ",
    });
    assert.deepEqual([...admins].sort(), [
      "owner@betamods.com",
      "second@example.com",
    ]);
  });
});

describe("effectiveArchiveLimit", () => {
  it("uses the pilot cap when it is lower than the hard ceiling", () => {
    assert.equal(
      effectiveArchiveLimit(limits({ maxArchiveBytes: 250 * MiB }), 512 * MiB),
      250 * MiB,
    );
  });

  it("never exceeds the absolute hard ceiling", () => {
    assert.equal(
      effectiveArchiveLimit(limits({ maxArchiveBytes: 4 * GiB }), 512 * MiB),
      512 * MiB,
    );
  });
});

describe("formatBytes", () => {
  it("renders sizes at a precision that reads like a cap", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(250 * MiB), "250 MiB");
    assert.equal(formatBytes(1.5 * GiB), "1.5 GiB");
    assert.equal(formatBytes(8 * GiB), "8 GiB");
  });

  it("never renders a negative or nonsense value", () => {
    assert.equal(formatBytes(-1), "0 B");
    assert.equal(formatBytes(Number.NaN), "0 B");
  });
});

describe("evaluateReservation", () => {
  it("allows an upload that fits every limit", () => {
    assert.deepEqual(evaluateReservation(facts()), { ok: true });
  });

  it("refuses when usage could not be established — fail closed", () => {
    // The caps only mean anything if an unknown total is a refusal rather than
    // a hopeful "sure, go ahead".
    const verdict = evaluateReservation({ ...facts(), usageKnown: false });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.reason, "usage-unavailable");
  });

  it("rate limits before it complains about size", () => {
    const verdict = evaluateReservation(
      facts({
        requestedBytes: 10 * GiB,
        attemptsInWindow: 99,
        limits: limits({ uploadsPerWindow: 10 }),
      }),
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.reason, "rate-limited");
  });

  it("rejects an archive over the per-file cap", () => {
    const verdict = evaluateReservation(
      facts({
        requestedBytes: 251 * MiB,
        limits: limits({ maxArchiveBytes: 250 * MiB }),
      }),
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.reason, "archive-too-large");
      assert.match(verdict.message, /250 MiB/);
    }
  });

  it("rejects a tester who would cross their own cap", () => {
    const verdict = evaluateReservation(
      facts({
        testerStoredBytes: 1400 * MiB,
        requestedBytes: 200 * MiB,
        limits: limits({ maxBytesPerTester: 1536 * MiB, maxTotalBytes: 8 * GiB }),
      }),
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.reason, "tester-cap");
      assert.match(verdict.message, /1.5 GiB/);
    }
  });

  it("counts a tester's in-flight reservations against their cap", () => {
    // Two uploads racing on one account: the second must see the first's held
    // bytes, not just the settled ones.
    const verdict = evaluateReservation(
      facts({
        testerReservedBytes: 1400 * MiB,
        requestedBytes: 200 * MiB,
        limits: limits({ maxBytesPerTester: 1536 * MiB }),
      }),
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.reason, "tester-cap");
  });

  it("rejects once the global cap is reached, counting in-flight bytes", () => {
    const verdict = evaluateReservation(
      facts({
        storedBytes: 7.5 * GiB,
        reservedBytes: 0.4 * GiB,
        requestedBytes: 0.2 * GiB,
        limits: limits({ maxTotalBytes: 8 * GiB }),
      }),
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.reason, "global-cap");
  });

  it("allows an upload that lands exactly on the global cap", () => {
    // The cap is inclusive: filling it exactly is allowed, one byte over is not.
    const verdict = evaluateReservation(
      facts({
        storedBytes: 700,
        reservedBytes: 200,
        requestedBytes: 100,
        limits: limits({ maxTotalBytes: 1000, maxBytesPerTester: 1000 }),
      }),
    );
    assert.deepEqual(verdict, { ok: true });

    const oneOver = evaluateReservation(
      facts({
        storedBytes: 700,
        reservedBytes: 200,
        requestedBytes: 101,
        limits: limits({ maxTotalBytes: 1000, maxBytesPerTester: 1000 }),
      }),
    );
    assert.equal(oneOver.ok, false);
    if (!oneOver.ok) assert.equal(oneOver.reason, "global-cap");
  });

  it("checks the per-tester cap before the global cap", () => {
    // Both would be true; the message has to name the one the user can act on.
    const verdict = evaluateReservation(
      facts({
        storedBytes: 8 * GiB,
        testerStoredBytes: 1.5 * GiB,
        requestedBytes: 1,
        limits: limits({ maxBytesPerTester: 1536 * MiB, maxTotalBytes: 8 * GiB }),
      }),
    );
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.reason, "tester-cap");
  });
});
