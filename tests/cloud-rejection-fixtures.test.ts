import assert from "node:assert/strict";
import { before, test } from "node:test";
import { validateCloudArchive } from "../lib/cloud-archive";

type Fixtures = typeof import("../scripts/cloud-rejection-fixtures.mjs");
let tooling: Fixtures;
before(async () => { tooling = await import("../scripts/cloud-rejection-fixtures.mjs"); });

test("fixture CLI accepts no live, file-input, or output-path options", () => {
  assert.deepEqual(tooling.parseFixtureArgs([]), { help: false });
  assert.deepEqual(tooling.parseFixtureArgs(["--help"]), { help: true });
  for (const args of [["--live"], ["--file=real-mod.zip"], ["--output=C:/existing"], ["--help", "--help"]]) {
    assert.throws(() => tooling.parseFixtureArgs(args));
  }
});

test("exactly five tiny rejection fixtures and one local-only positive baseline are deterministic", () => {
  const fixtures = tooling.createRejectionFixtures();
  assert.equal(fixtures.length, 6);
  assert.equal(fixtures.filter(fixture => !fixture.ok).length, 5);
  assert.equal(fixtures.filter(fixture => fixture.ok).length, 1);
  assert.match(fixtures[0].name, /local-only/);
  for (const fixture of fixtures) {
    assert.match(fixture.name, /^\d{2}-[a-z-]+\.zip$/);
    assert.ok(fixture.bytes.length > 0 && fixture.bytes.length <= tooling.MAX_FIXTURE_BYTES);
    assert.equal(fixture.bytes.readUInt16LE(8), 0, "stored entries cannot create a decompression bomb");
  }
  assert.deepEqual(tooling.createRejectionFixtures(), fixtures);
});

test("real ZIP validator accepts the baseline and rejects each fixture with its exact intended app message", async () => {
  const fixtures = await tooling.selfTestRejectionFixtures();
  const baseline = await validateCloudArchive(fixtures[0].bytes);
  assert.equal(baseline.ok, true);
  for (const fixture of fixtures.slice(1)) {
    const result = await validateCloudArchive(fixture.bytes);
    assert.equal(result.ok, false, fixture.name);
    if (!result.ok) assert.equal(result.message, fixture.message, fixture.name);
  }
});

test("nested fixture contains only the small valid baseline, with no compressed expansion", () => {
  const fixtures = tooling.createRejectionFixtures();
  const nested = fixtures[3].bytes;
  const payloadStart = 30 + nested.readUInt16LE(26);
  const payloadSize = nested.readUInt32LE(18);
  assert.equal(payloadSize, nested.readUInt32LE(22));
  assert.deepEqual(nested.subarray(payloadStart, payloadStart + payloadSize), fixtures[0].bytes);
});

test("self-test fails before writing for a missing fixture, oversized buffer, or unexpected pass", async () => {
  await assert.rejects(tooling.selfTestRejectionFixtures(tooling.createRejectionFixtures().slice(1)), /one baseline and five/);
  const oversized = tooling.createRejectionFixtures();
  oversized[1].bytes = Buffer.alloc(tooling.MAX_FIXTURE_BYTES + 1);
  await assert.rejects(tooling.selfTestRejectionFixtures(oversized), /2048/);
  const unexpectedPass = tooling.createRejectionFixtures();
  unexpectedPass[1].bytes = Buffer.from(unexpectedPass[0].bytes);
  await assert.rejects(tooling.selfTestRejectionFixtures(unexpectedPass), /Unexpected local ZIP-policy result/);
});
