import assert from "node:assert/strict";
import { before, test } from "node:test";
import { scanBudgetCharge } from "../lib/cloud-scan-budget";

type Tool = typeof import("../scripts/cloud-positive-export-fixtures.mjs");
let tool: Tool;
before(async () => { tool = await import("../scripts/cloud-positive-export-fixtures.mjs"); });

test("positive fixture CLI defaults offline and never accepts inputs or live options", () => {
  assert.deepEqual(tool.parsePositiveArgs([]), { help: false, writeTemp: false });
  assert.deepEqual(tool.parsePositiveArgs(["--write-temp"]), { help: false, writeTemp: true });
  assert.deepEqual(tool.parsePositiveArgs(["--help"]), { help: true, writeTemp: false });
  for (const args of [["--live"], ["--input=x"], ["--output=x"], ["--write-temp", "--write-temp"]]) assert.throws(() => tool.parsePositiveArgs(args));
});

test("synthetic noise is deterministic, seed-distinct, visible-alpha and pixel-bounded", () => {
  const first = tool.syntheticPixels(160, 160, 9182);
  assert.deepEqual(first, tool.syntheticPixels(160, 160, 9182));
  assert.notDeepEqual(first, tool.syntheticPixels(160, 160, 9183));
  for (let index = 3; index < first.length; index += 4) assert.ok(first[index] >= 128);
  for (const dimensions of [[159, 160], [2049, 2048], [160, 4096]]) assert.throws(() => tool.syntheticPixels(dimensions[0], dimensions[1], 1));
  assert.throws(() => tool.syntheticPixels(160, 160, 0));
});

test("metadata fills even and odd export margins through bounded ordinary form fields", () => {
  for (const difference of [4, 5, 7999, 8000, 15999, 16000]) {
    const fields = tool.tuneMetadata(tool.POSITIVE_LIMITS.input - difference);
    assert.equal(fields.addedAccountedBytes, difference);
    assert.ok(fields.description.length <= 10000 && fields.changelog.length <= 5000);
    assert.equal(fields.description.split("\n")[0], tool.LISTING.description);
    assert.equal(2 * (fields.description.length - tool.LISTING.description.length) + fields.changelog.length - tool.LISTING.changelog.length, difference);
  }
  for (const invalid of [NaN, tool.POSITIVE_LIMITS.input + 1, tool.POSITIVE_LIMITS.input - 3, tool.POSITIVE_LIMITS.input - 16001]) assert.throws(() => tool.tuneMetadata(invalid));
});

test("entry accounting uses real payload and fixed path overhead, rejecting unsafe fixtures", () => {
  const name = "promotion-cloud-export-boundary-fixture/files/boundary-build.zip";
  assert.equal(tool.accountedEntryBytes([{ name, bytes: 123 }]), 123 + 1024 + 2 * Buffer.byteLength(name));
  for (const entries of [[], [{ name: "elsewhere/file", bytes: 1 }], [{ name, bytes: -1 }], [{ name, bytes: 9 * 1024 * 1024 }], [{ name, bytes: 1 }, { name, bytes: 1 }]]) assert.throws(() => tool.accountedEntryBytes(entries));
});

test("normal browser CRLF adds one readme byte offset by one changelog character", () => {
  for (const difference of [4, 5, 8000, 15999]) {
    const baseline = tool.tuneMetadata(tool.POSITIVE_LIMITS.input - difference);
    const form = tool.browserFormMetadata(baseline);
    assert.equal(form.description.length, baseline.description.length + 1);
    assert.equal(form.description.replace(/\r\n/g, "\n"), baseline.description);
    assert.equal(form.changelog.length, baseline.changelog.length - 1);
    assert.deepEqual(tool.browserFormMetadata(form), form, "already serialized metadata is not trimmed twice");
    if (difference % 2 === 0) assert.equal(form.changelog, "Synthetic capacity fixture");
  }
});

test("scan estimate uses actual envelope-aware production charge at exact8MiB", () => {
  const sources = [
    { originalBytes: 8388608, storedBytes: 8388608, scans: 1 },
    { originalBytes: 7182310, storedBytes: 6781706, scans: 2 },
    { originalBytes: 7182102, storedBytes: 6781932, scans: 2 },
    { originalBytes: 7182348, storedBytes: 6781714, scans: 2 },
    { originalBytes: 5090772, storedBytes: 4806526, scans: 2 },
  ];
  assert.equal(scanBudgetCharge(8388608), 27);
  assert.equal(tool.totalScanChargeMiB(sources, scanBudgetCharge), 183);
});
