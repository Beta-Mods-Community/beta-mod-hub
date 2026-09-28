// Parsing for `docker compose ps --format json`.
//
// Extracted from scripts/smoke-prod.mjs so it can be unit tested, because the
// shape of this output is a moving target across Compose releases and the
// smoke test's ability to notice anything at all depends on parsing it right.
//
// Two shapes exist in the wild:
//
//   * Compose v5+ emits NDJSON -- one JSON object per line.
//   * Older releases emit a single JSON array of those objects.
//
// We used to solve the "make the output parseable" problem with `docker
// compose -T`, which disables the pseudo-TTY. That flag is not valid in Docker
// Compose 5.5.1 (`unknown shorthand flag: T`), so it broke every invocation of
// the home stack. Parsing both shapes is the fix that does not depend on a flag
// existing.

/**
 * One row of `compose ps --format json`, as far as the smoke test cares.
 *
 * A JSDoc typedef rather than a TypeScript alias: this is a .mjs file, and
 * `export type` is TS-only syntax that node cannot parse.
 *
 * @typedef {{
 *   Service?: string,
 *   Name?: string,
 *   State?: string,
 *   Health?: string,
 *   Status?: string,
 *   Publishers?: unknown,
 * }} ComposePsRow
 */

/**
 * Parse `docker compose ps --format json` output into a list of service rows.
 *
 * Throws on output it cannot understand. That is deliberate: a smoke test that
 * silently treats unparseable output as "no services found" would report a
 * healthy stack that does not exist. Failing loudly is the correct behaviour.
 */
export function parseComposePs(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return [];

  // The common case on older releases, and the single-service case in any
  // release: one JSON document covering everything.
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // NDJSON: JSON.parse throws on the second object, which is exactly how we
    // detect this shape.
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (cause) {
        throw new Error(
          `could not parse a line of \`compose ps --format json\` output: ${line.slice(0, 120)}\n` +
            "Either this Compose release emits a shape we do not handle, or it " +
            "printed a warning on stdout.",
          { cause },
        );
      }
    });
}
