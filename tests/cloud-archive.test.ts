import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { ZipArchive } from "archiver";
import { validateCloudArchive } from "../lib/cloud-archive";
import { CLOUD_SCAN_MAX_BYTES, createScanEnvelope, crc32, SCAN_ENVELOPE_OVERHEAD } from "../lib/cloud-zip";

type Fixture = { name: string; bytes: Buffer; method?: number; attributes?: number; flags?: number; declaredSize?: number; compressedSuffix?: Buffer };
function zip(files: Fixture[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const method = file.method ?? 0;
    const compressed = Buffer.concat([method === 8 ? deflateRawSync(file.bytes) : file.bytes, file.compressedSuffix ?? Buffer.alloc(0)]);
    const checksum = crc32(file.bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(file.flags ?? 0, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(file.declaredSize ?? file.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(0x0314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(file.flags ?? 0, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(file.declaredSize ?? file.bytes.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(file.attributes ?? 0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + compressed.length;
  }
  const directoryBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directoryBytes, end]);
}
const file = (name = "readme.txt", bytes: Buffer = Buffer.from("A harmless test mod.\n")): Fixture => ({ name, bytes });
const centralOffset = (bytes: Buffer) => bytes.readUInt32LE(bytes.length - 6);

test("CRC32 supports streaming updates and the standard check vector", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(Buffer.from("56789"), crc32(Buffer.from("1234"))), 0xcbf43926);
});

test("server envelope preserves exact bytes and only adds bounded ZIP headers", async () => {
  const input = Buffer.from("Benign bytes, not a user's filename.");
  const envelope = createScanEnvelope(input);
  assert.equal(envelope.length, input.length + SCAN_ENVELOPE_OVERHEAD);
  assert.deepEqual(envelope.subarray(41, 41 + input.length), input);
  assert.deepEqual(await validateCloudArchive(envelope), { ok: true, entries: 1, expandedBytes: input.length });
  assert.deepEqual(createScanEnvelope(input), envelope);
  assert.throws(() => createScanEnvelope(Buffer.alloc(0)));
  assert.throws(() => createScanEnvelope(Buffer.alloc(CLOUD_SCAN_MAX_BYTES + 1)));
});

test("accepts stored and deflated plain files, directories, and empty members", async () => {
  const archive = zip([
    { ...file("scripts/", Buffer.alloc(0)), attributes: (0x4000 << 16) >>> 0 },
    file("scripts/init.lua"), { ...file("notes.txt"), method: 8 }, file("empty.txt", Buffer.alloc(0)),
  ]);
  const result = await validateCloudArchive(archive);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.entries, 4);
});

test("accepts standard archiver streaming ZIP data descriptors", async () => {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", chunk => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });
  archive.append(Buffer.from("Test package"), { name: "readme.txt" });
  await archive.finalize();
  assert.equal((await validateCloudArchive(await finished)).ok, true);
});

test("a valid ZIP containing EICAR is structurally valid: this policy is not a scan bypass", async () => {
  const eicar = Buffer.from(["X5O!P%@AP[4", "\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-", "ANTIVIRUS-TEST-FILE!$H+H*"].join(""));
  assert.equal((await validateCloudArchive(zip([file("test.txt", eicar)]))).ok, true);
});

test("rejects malformed, truncated, non-ZIP, appended data and prepended stubs", async () => {
  const archive = zip([file()]);
  for (const bytes of [Buffer.from("not a zip"), Buffer.from([0x50, 0x4b, 3, 4, 0]), archive.subarray(0, -1), Buffer.concat([archive, Buffer.from("hidden")]), Buffer.concat([Buffer.from("MZ"), archive])]) {
    assert.equal((await validateCloudArchive(bytes)).ok, false);
  }
});

test("rejects encryption and unsupported compression", async () => {
  assert.equal((await validateCloudArchive(zip([{ ...file(), flags: 1 }]))).ok, false);
  assert.equal((await validateCloudArchive(zip([{ ...file(), method: 99 }]))).ok, false);
});

test("rejects symlinks and device members", async () => {
  for (const mode of [0xa000, 0x2000, 0x6000, 0x1000]) {
    assert.equal((await validateCloudArchive(zip([{ ...file(), attributes: (mode << 16) >>> 0 }]))).ok, false);
  }
});

test("rejects dangerous paths, duplicate paths and Windows path aliases", async () => {
  for (const name of ["../escape.txt", "/root.txt", "C:/root.txt", "dir\\file.txt", "dir/./file.txt", "dir//file.txt", "nul.txt", "stream:payload", "trailing. ", "bad\0name.txt"]) {
    assert.equal((await validateCloudArchive(zip([file(name)]))).ok, false, name);
  }
  assert.equal((await validateCloudArchive(zip([file("TEST.txt"), file("test.txt")]))).ok, false);
  assert.equal((await validateCloudArchive(zip([file("parent"), file("parent/child.txt")]))).ok, false);
  assert.equal((await validateCloudArchive(zip([file("parent/child.txt"), file("parent")]))).ok, false);
});

test("rejects nested archive suffixes and magic even when renamed or embedded", async () => {
  for (const name of ["inside.zip", "inside.7z", "inside.BSA", "inside.ba2", "inside.tar.gz", "inside.docx"]) {
    assert.equal((await validateCloudArchive(zip([file(name)]))).ok, false, name);
  }
  for (const bytes of [zip([file()]), Buffer.concat([Buffer.from("MZprefix"), zip([file()])]), Buffer.from([0x1f, 0x8b, 8, 0]), Buffer.from("Rar!\x1a\x07", "binary"), Buffer.from("BSA\0", "binary")]) {
    assert.equal((await validateCloudArchive(zip([file("renamed.bin", bytes)]))).ok, false);
  }
});

test("rejects CRC mismatches even when local and central headers agree", async () => {
  const archive = zip([file()]);
  archive.writeUInt32LE(123, 14);
  archive.writeUInt32LE(123, centralOffset(archive) + 16);
  const result = await validateCloudArchive(archive);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /integrity/);
});

test("rejects inconsistent local headers, ZIP64 and multi-disk headers", async () => {
  const header = zip([file()]);
  header.writeUInt32LE(123, 14);
  assert.equal((await validateCloudArchive(header)).ok, false);
  const zip64 = zip([file()]);
  zip64.writeUInt16LE(45, centralOffset(zip64) + 6);
  assert.equal((await validateCloudArchive(zip64)).ok, false);
  const disks = zip([file()]);
  disks.writeUInt16LE(1, disks.length - 18);
  assert.equal((await validateCloudArchive(disks)).ok, false);
});

test("rejects actual decompressed bytes exceeding declared size", async () => {
  const archive = zip([{ ...file("short.txt", Buffer.alloc(100_000, 65)), method: 8, declaredSize: 10 }]);
  assert.equal((await validateCloudArchive(archive)).ok, false);
});

test("rejects hidden trailing bytes inside a deflated member", async () => {
  const archive = zip([{ ...file(), method: 8, compressedSuffix: Buffer.from("hidden unscanned bytes") }]);
  assert.equal((await validateCloudArchive(archive)).ok, false);
});

test("enforces original, per-member, expanded and entry-count limits", async () => {
  assert.equal((await validateCloudArchive(Buffer.alloc(CLOUD_SCAN_MAX_BYTES + 1))).ok, false);
  assert.equal((await validateCloudArchive(zip([{ ...file(), declaredSize: CLOUD_SCAN_MAX_BYTES + 1 }]))).ok, false);
  assert.equal((await validateCloudArchive(zip(Array.from({ length: 5 }, (_, i) => ({ ...file(`${i}.txt`), declaredSize: CLOUD_SCAN_MAX_BYTES }))))).ok, false);
  assert.equal((await validateCloudArchive(zip(Array.from({ length: 257 }, (_, i) => file(`${i}.txt`))))).ok, false);
  assert.equal((await validateCloudArchive(zip([file("empty/", Buffer.alloc(0))]))).ok, false);
});
