import assert from "node:assert/strict";
import { before, test } from "node:test";
import { CLOUD_SCAN_MAX_BYTES } from "../lib/cloud-zip";

type Smoke = typeof import("../scripts/cloud-scan-smoke.mjs");
let smoke: Smoke;
before(async () => { smoke = await import("../scripts/cloud-scan-smoke.mjs"); });

test("cloud scanner smoke defaults to no network and only accepts explicit bounded options", () => {
  assert.deepEqual(smoke.parseSmokeArgs([]), { live: false, boundary: false, media: false, help: false });
  assert.equal(smoke.parseSmokeArgs(["--live"]).live, true);
  for (const args of [["--live", "--live"], ["--file=real-mod.zip"], ["--credentials=env"], ["--url=https://example.com"]]) assert.throws(() => smoke.parseSmokeArgs(args));
});

test("smoke credential parser demands explicit algorithm and refuses unrelated app credentials", () => {
  const basic = "TRANSLOADIT_KEY=synthetic-key\nTRANSLOADIT_SECRET=synthetic-secret-no-live-access\n";
  assert.throws(() => smoke.parseSmokeCredentials(basic));
  assert.throws(() => smoke.parseSmokeCredentials(`${basic}TRANSLOADIT_SIGNATURE_ALGORITHM=md5`));
  assert.throws(() => smoke.parseSmokeCredentials(`${basic}TRANSLOADIT_SIGNATURE_ALGORITHM=sha384\nDATABASE_URL=not-permitted`));
  assert.throws(() => smoke.parseSmokeCredentials(`${basic}TRANSLOADIT_SIGNATURE_ALGORITHM=sha384\nTRANSLOADIT_KEY=duplicate`));
  assert.equal(smoke.parseSmokeCredentials(`${basic}TRANSLOADIT_SIGNATURE_ALGORITHM=sha384`).algorithm, "sha384");
});

test("default smoke generates exactly four small synthetic in-memory fixtures", async () => {
  const fixtures = await smoke.createSmokeFixtures();
  assert.equal(fixtures.length, 4);
  assert.deepEqual(fixtures.map(fixture => fixture.expected), ["clean", "clean", "infected", "infected"]);
  assert.ok(fixtures.every(fixture => fixture.bytes.length < 64 * 1024));
  assert.deepEqual(fixtures[1].bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(fixtures[3].bytes.readUInt32LE(0), 0x04034b50);
});

test("optional WebP and exact 8 MiB synthetic boundary are explicit additional jobs", async () => {
  const fixtures = await smoke.createSmokeFixtures({ boundary: true, media: true });
  assert.equal(fixtures.length, 6);
  assert.equal(fixtures[4].bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(fixtures[4].bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(fixtures[5].bytes.length, CLOUD_SCAN_MAX_BYTES);
});
