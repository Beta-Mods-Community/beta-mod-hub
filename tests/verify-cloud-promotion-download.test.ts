import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { before, test } from "node:test";
import { ZipArchive } from "archiver";

type Verify = typeof import("../scripts/verify-cloud-promotion-download.mjs");
type Package = typeof import("../scripts/cloud-positive-export-fixtures.mjs");
let verifier: Verify; let packages: Package;
before(async () => {
  verifier = await import("../scripts/verify-cloud-promotion-download.mjs");
  packages = await import("../scripts/cloud-positive-export-fixtures.mjs");
});
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

// Metadata-only boundary cases and tiny ZIP buffers; no fixture files written.
function boundaryMetadata() {
  const root = packages.POSITIVE_PACKAGE_ROOT;
  const MiB = 1024 * 1024;
  const sources = [8 * MiB, 6 * MiB, 6 * MiB, 6 * MiB, 6 * MiB - 20000].map((storedBytes, index) => ({
    filename: index === 0 ? "boundary-build.zip" : `boundary-image-${index}.webp`, storedBytes, storedSha256: hash(`payload${index}`),
  }));
  const imageNames = [1, 2, 3, 4].map(index => `0${index}-11111111-1111-4111-8111-${String(index).padStart(12, "0")}.webp`);
  const captions = `${imageNames.join("\n")}\n`;
  const entries = ["description.bbcode.txt", "summary.txt", "readme.txt", "changelog.txt", "requirements.txt"]
    .map(name => ({ name: `${root}/${name}`, bytes: 10, sha256: hash(name) }));
  entries.push({ name: `${root}/media/captions.txt`, bytes: Buffer.byteLength(captions), sha256: hash(captions) });
  for (const [index, source] of sources.entries()) entries.push({ name: `${root}/${index === 0 ? "files/boundary-build.zip" : `media/${imageNames[index - 1]}`}`, bytes: source.storedBytes, sha256: source.storedSha256 });
  entries[0].bytes += packages.POSITIVE_LIMITS.input - packages.accountedEntryBytes(entries);
  const packageEntries = entries.map(entry => ({ ...entry, name: entry.name.replace(/11111111-1111-4111-8111-/g, "00000000-0000-4000-8000-") }));
  return { entries, manifest: { sources, packageEntries, accountedExportBytes: packages.POSITIVE_LIMITS.input } };
}

async function tinyZip(names: string[]) {
  const archive = new ZipArchive(); const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => { archive.once("end", resolve); archive.once("error", reject); });
  archive.on("data", chunk => chunks.push(chunk));
  for (const name of names) archive.append("synthetic harmless text", { name, store: true });
  await archive.finalize(); await done;
  return Buffer.concat(chunks);
}

test("download verifier requires explicit absolute ZIP and manifest paths, never a search or live mode", () => {
  assert.deepEqual(verifier.parsePromotionVerificationArgs([]), { help: true });
  const zip = path.resolve("explicit-download.zip"); const manifest = path.resolve("existing-manifest.json");
  assert.deepEqual(verifier.parsePromotionVerificationArgs(["--zip", zip, "--manifest", manifest]), { help: false, zip, manifest });
  for (const args of [["--search"], ["--zip", "relative.zip", "--manifest", manifest], ["--zip", zip, "--manifest", zip], ["--manifest", manifest, "--zip", zip], ["--zip", "//server/share/file.zip", "--manifest", manifest]]) {
    assert.throws(() => verifier.parsePromotionVerificationArgs(args));
  }
});

test("metadata verifier accounts real server UUID names and all five payload hashes at exactly32MiB", () => {
  const { entries, manifest } = boundaryMetadata();
  const result = verifier.verifyPromotionEntries(entries, manifest);
  assert.equal(result.accountedBytes, 33554432);
  assert.equal(result.payloadHashesVerified, 5);
  assert.equal(result.entries, 11);
  assert.equal(result.captionsHashVerified, true);
  assert.equal(result.otherTextContentVerified, false);
  assert.match(result.oneByteOverHostedAssertion, /NOT PERFORMED/);
});

test("historical text metadata is explicitly excluded without modifying the manifest or five payload expectations", () => {
  const value = boundaryMetadata();
  // Model the browser correction: readme gained CR; changelog lost one ASCII byte.
  value.entries[2].bytes++; value.entries[2].sha256 = hash("corrected CRLF readme");
  value.entries[3].bytes--; value.entries[3].sha256 = hash("corrected changelog");
  const manifestBefore = JSON.stringify(value.manifest);
  const result = verifier.verifyPromotionEntries(value.entries, value.manifest);
  assert.equal(result.payloadHashesVerified, 5);
  assert.equal(result.accountedBytes, 33554432);
  assert.equal(result.otherTextContentVerified, false);
  assert.match(result.otherTextScope, /historical manifest text is not compared/);
  assert.equal(JSON.stringify(value.manifest), manifestBefore);
});

test("metadata verifier refuses changed payloads, missing/extra/duplicate entries and reused image UUIDs", () => {
  for (const change of [
    (value: ReturnType<typeof boundaryMetadata>) => { value.entries[6].sha256 = "f".repeat(64); },
    (value: ReturnType<typeof boundaryMetadata>) => { value.entries.pop(); },
    (value: ReturnType<typeof boundaryMetadata>) => { value.entries.push({ ...value.entries[0], name: "unexpected" }); },
    (value: ReturnType<typeof boundaryMetadata>) => { value.entries[1] = { ...value.entries[0] }; },
    (value: ReturnType<typeof boundaryMetadata>) => { value.entries[7].name = value.entries[7].name.replace("000000000001", "000000000002"); },
    (value: ReturnType<typeof boundaryMetadata>) => { value.entries[5].sha256 = hash("unexpected caption"); },
    (value: ReturnType<typeof boundaryMetadata>) => { value.entries[5].bytes++; value.entries[0].bytes--; },
  ]) {
    const value = boundaryMetadata(); change(value);
    assert.throws(() => verifier.verifyPromotionEntries(value.entries, value.manifest));
  }
});

test("one extra accounted byte fails locally without claiming the separate hosted refusal", () => {
  const value = boundaryMetadata(); value.entries[0].bytes++; value.manifest.packageEntries[0].bytes++;
  assert.throws(() => verifier.verifyPromotionEntries(value.entries, value.manifest), /exact 32 MiB/);
});

test("shared ZIP inspector hashes real streamed bytes and rejects unexpected or duplicate names", async () => {
  const name = `${packages.POSITIVE_PACKAGE_ROOT}/readme.txt`;
  const bytes = await tinyZip([name]);
  assert.deepEqual(await packages.inspectPackageBytes(bytes), [{ name, bytes: Buffer.byteLength("synthetic harmless text"), sha256: hash("synthetic harmless text") }]);
  await assert.rejects(packages.inspectPackageBytes(await tinyZip([name, name])), /duplicate/);
  await assert.rejects(packages.inspectPackageBytes(await tinyZip([`${packages.POSITIVE_PACKAGE_ROOT}/unexpected.txt`])), /Unexpected/);
});

test("shared ZIP inspector refuses oversized declarations, excess entries and corrupt bytes without extraction", async () => {
  const name = `${packages.POSITIVE_PACKAGE_ROOT}/readme.txt`;
  const oversized = await tinyZip([name]);
  const central = oversized.readUInt32LE(oversized.length - 6);
  oversized.writeUInt32LE(packages.POSITIVE_LIMITS.file + 1, central + 24);
  await assert.rejects(packages.inspectPackageBytes(oversized));
  await assert.rejects(packages.inspectPackageBytes(await tinyZip(Array.from({ length: 12 }, () => name))));
  const corrupt = await tinyZip([name]);
  corrupt[30 + Buffer.byteLength(name)] ^= 1;
  await assert.rejects(packages.inspectPackageBytes(corrupt), /CRC/);
});
