import assert from "node:assert/strict";
import { before, mock, test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import yauzl from "yauzl";
import { validateCloudArchive } from "../lib/cloud-archive";

type Tooling = typeof import("../scripts/cloud-boundary-fixtures.mjs");
let tooling: Tooling;
let fixtures: Awaited<ReturnType<Tooling["createBoundaryFixtures"]>>;
before(async () => {
  tooling = await import("../scripts/cloud-boundary-fixtures.mjs");
  fixtures = await tooling.createBoundaryFixtures();
});

test("boundary CLI is offline by default and only optionally writes a fresh temp directory", () => {
  assert.deepEqual(tooling.parseBoundaryArgs([]), { help: false, writeTemp: false });
  assert.deepEqual(tooling.parseBoundaryArgs(["--write-temp"]), { help: false, writeTemp: true });
  assert.deepEqual(tooling.parseBoundaryArgs(["--help"]), { help: true, writeTemp: false });
  for (const args of [["--live"], ["--file=anything"], ["--output=anything"], ["--write-temp", "--write-temp"], ["--help", "--write-temp"]]) {
    assert.throws(() => tooling.parseBoundaryArgs(args));
  }
});

test("five fixed fixtures have bounded sizes and only stored ZIP payloads", () => {
  assert.equal(fixtures.length, 5);
  assert.equal(fixtures[0].bytes.length, tooling.BOUNDARY_LIMITS.file + 1);
  assert.equal(fixtures[1].bytes.length, tooling.BOUNDARY_LIMITS.body + 1);
  assert.ok(fixtures[2].bytes.length < 128 * 1024);
  for (const index of [0, 1, 3, 4]) {
    const entries = tooling.declaredZipSizes(fixtures[index].bytes);
    assert.ok(entries.every(entry => entry.method === 0));
    assert.ok(fixtures[index].bytes.length <= tooling.BOUNDARY_LIMITS.body + 1);
  }
});

test("all real policy self-tests pass and representative multipart sizes isolate the intended gates", async () => {
  const previous = process.env.CLOUD_PILOT;
  const result = await tooling.selfTestBoundaryFixtures(fixtures);
  assert.equal(process.env.CLOUD_PILOT, previous);
  assert.equal(result.length, 5);
  const smallBody = await tooling.serializedFixtureBodyBytes(fixtures[0]);
  const largeBody = await tooling.serializedFixtureBodyBytes(fixtures[1]);
  assert.ok(smallBody > tooling.BOUNDARY_LIMITS.file && smallBody < tooling.BOUNDARY_LIMITS.body);
  assert.ok(tooling.BOUNDARY_LIMITS.body - smallBody > 1024 * 1000, "ordinary hidden fields retain substantial headroom");
  assert.ok(largeBody > tooling.BOUNDARY_LIMITS.body);
  assert.deepEqual(result.map(item => [item.attempts, item.scans]), [[0, 0], [0, 0], [1, 1], [1, 0], [1, 0]]);
});

test("pixel fixture is a genuine small PNG over only the combined cloud pixel ceiling", async () => {
  const metadata = await sharp(fixtures[2].bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 2049);
  assert.equal(metadata.height, 2048);
  assert.ok(metadata.width! <= 4096 && metadata.height! <= 4096);
  assert.ok(metadata.width! * metadata.height! > tooling.BOUNDARY_LIMITS.pixels);
  assert.ok(fixtures[2].bytes.length < tooling.BOUNDARY_LIMITS.file);
});

test("declared expansion fixtures fail in layout checks before opening a ZIP reader", async () => {
  const spy = mock.method(yauzl, "fromBuffer");
  try {
    for (const index of [3, 4]) {
      const fixture = fixtures[index];
      assert.ok(fixture.bytes.length < 1024);
      const entries = tooling.declaredZipSizes(fixture.bytes);
      assert.equal(entries.reduce((sum, entry) => sum + entry.actualBytes, 0), index === 3 ? 1 : 5);
      assert.deepEqual(await validateCloudArchive(fixture.bytes), { ok: false, reason: "invalid-archive", message: fixture.expected });
    }
    assert.equal(spy.mock.callCount(), 0, "declared over-limit sizes reject before any stream/extraction/decompression");
  } finally { spy.mock.restore(); }
});

test("self-test refuses missing, renamed, oversized, or wrong fixtures before optional writing", async () => {
  await assert.rejects(tooling.selfTestBoundaryFixtures(fixtures.slice(1)));
  const renamed = fixtures.map(fixture => ({ ...fixture })); Object.assign(renamed[0], { name: "../unsafe.zip" });
  await assert.rejects(tooling.selfTestBoundaryFixtures(renamed));
  const oversized = fixtures.map(fixture => ({ ...fixture })); oversized[0].bytes = Buffer.alloc(tooling.BOUNDARY_LIMITS.body + 2);
  await assert.rejects(tooling.selfTestBoundaryFixtures(oversized));
  const wrong = fixtures.map(fixture => ({ ...fixture })); wrong[0].bytes = Buffer.from("wrong");
  await assert.rejects(tooling.selfTestBoundaryFixtures(wrong));
});

test("charge expectations match actual action ordering without invoking a database or scanner", () => {
  const read = (name: string) => readFileSync(path.join(import.meta.dirname, "..", "lib", name), "utf8");
  const build = read("build-uploads.ts");
  assert.ok(build.indexOf("const archiveError = validateBuildArchive") < build.indexOf("const reservation = await reserveStorage"));
  assert.ok(build.indexOf("const reservation = await reserveStorage") < build.indexOf("const archive = await validateCloudArchive"));
  assert.ok(build.indexOf("const archive = await validateCloudArchive") < build.indexOf("const scan = await scanUpload"));
  const image = read("media-upload.ts");
  assert.ok(image.indexOf("assertClean(await deps.scan(original))") < image.indexOf("const image = await deps.decode(original)"));
  assert.ok(image.indexOf("const image = await deps.decode(original)") < image.indexOf("assertClean(await deps.scan(image.data))"));
});
