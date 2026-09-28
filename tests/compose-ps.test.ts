import { before, describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * `docker compose ps --format json` parsing.
 *
 * This is worth unit testing out of proportion to its size, because the smoke
 * test's ability to notice ANYTHING depends on it, and because the shape of the
 * output is a moving target across Compose releases:
 *
 *   * Docker Compose 5.5.1 (the version on the home host) emits NDJSON — one
 *     JSON object per line.
 *   * Older releases emit a single JSON array of those objects.
 *
 * The rehearsal that produced scripts/compose-ps.mjs was broken by neither of
 * these, but by the usual workaround: `docker compose -T` to suppress the
 * pseudo-TTY. That flag does not exist in Compose 5.5.1 ("unknown shorthand
 * flag: T"), so every compose invocation in the home stack failed. The lesson
 * encoded in the parser is to accept whatever arrives rather than depend on a
 * flag to reshape it.
 */

// Imported inside before() because this package is CommonJS by default and
// top-level await cannot be transformed in a .ts file.
type Module = typeof import("../scripts/compose-ps.mjs");
let composePs: Module;

before(async () => {
  composePs = await import("../scripts/compose-ps.mjs");
});

const row = (service: string, extra: Record<string, unknown> = {}) => ({
  Service: service,
  Name: `betamods-home-${service}-1`,
  State: "running",
  Health: "healthy",
  Status: `Up 2 minutes (healthy)`,
  ...extra,
});

describe("parseComposePs", () => {
  it("parses the NDJSON that Compose 5.x emits", () => {
    const stdout = [row("app"), row("clamav"), row("scan-server")]
      .map((r) => JSON.stringify(r))
      .join("\n");
    const rows = composePs.parseComposePs(stdout);

    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.Service),
      ["app", "clamav", "scan-server"],
    );
    assert.equal(rows[0].State, "running");
    assert.equal(rows[0].Health, "healthy");
  });

  it("parses the single JSON array that older Compose emits", () => {
    const stdout = JSON.stringify([row("app"), row("caddy")]);
    const rows = composePs.parseComposePs(stdout);

    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.Service),
      ["app", "caddy"],
    );
  });

  it("returns a single row as a list", () => {
    // A one-service stack can come back as a bare object rather than an array.
    const rows = composePs.parseComposePs(JSON.stringify(row("app")));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].Service, "app");
  });

  it("returns an empty list for no output at all", () => {
    // `ps` with nothing running prints nothing, and that is a real (failing)
    // state the caller must see as an empty list -- not as a crash.
    assert.deepEqual(composePs.parseComposePs(""), []);
    assert.deepEqual(composePs.parseComposePs("   \n  \n"), []);
  });

  it("tolerates surrounding and interior whitespace", () => {
    // The output arrives with a trailing newline, and the NDJSON path must not
    // invent a row from a blank line.
    const stdout = `\n  ${JSON.stringify(row("app"))}  \n\n${JSON.stringify(row("clamav"))}\n`;
    const rows = composePs.parseComposePs(stdout);
    assert.deepEqual(
      rows.map((r) => r.Service),
      ["app", "clamav"],
    );
  });

  it("handles CRLF line endings", () => {
    // Not theoretical: this runs on a Windows host.
    const stdout = [row("app"), row("clamav")].map((r) => JSON.stringify(r)).join("\r\n");
    const rows = composePs.parseComposePs(stdout);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].Service, "clamav");
  });

  it("preserves fields the caller reads, including publishers", () => {
    const stdout = JSON.stringify(
      row("app", { Publishers: [{ PublishedPort: 3000, TargetPort: 3000 }] }),
    );
    const [parsed] = composePs.parseComposePs(stdout);
    assert.equal((parsed.Publishers as unknown[]).length, 1);
  });

  it("throws on output it cannot understand, naming the offending line", () => {
    // A smoke test that silently treated garbage as "no services" would
    // report a healthy stack that does not exist. Failing loudly is the point.
    const stdout = `${JSON.stringify(row("app"))}\nWARN: something unexpected`;
    assert.throws(
      () => composePs.parseComposePs(stdout),
      (error: Error) => {
        assert.match(error.message, /could not parse a line/);
        assert.match(error.message, /WARN: something unexpected/);
        return true;
      },
    );
  });

  it("does not mistake an empty JSON array for NDJSON", () => {
    // "[]" parses as a document, so the NDJSON fallback must never be reached.
    assert.deepEqual(composePs.parseComposePs("[]"), []);
  });
});
