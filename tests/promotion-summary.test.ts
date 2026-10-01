import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSummary, NEXUS_SUMMARY_LIMIT } from "../lib/promotion";

test("release summary uses the first nonempty line as plain text", () => {
  assert.deepEqual(deriveSummary("\n  **Useful change** for [Skyrim](https://example.test).\n## Setup"), { summary: "Useful change for Skyrim." });
});

test("the exporter accepts its 250-character boundary and rejects a longer summary", () => {
  assert.equal(NEXUS_SUMMARY_LIMIT, 250);
  assert.deepEqual(deriveSummary("a".repeat(250)), { summary: "a".repeat(250) });
  assert.equal(deriveSummary("a".repeat(251)), null);
});
