import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { describe, it } from "node:test";
import { buildPromotionPackage, type PromotionPackageInput } from "../lib/promotion";

function zipEntries(zip: Buffer) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0);
  let cursor = zip.readUInt32LE(eocd + 16);
  const count = zip.readUInt16LE(eocd + 10);
  const entries = new Map<string, Buffer>();
  for (let index = 0; index < count; index++) {
    assert.equal(zip.readUInt32LE(cursor), 0x02014b50);
    const method = zip.readUInt16LE(cursor + 10);
    const size = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const local = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    const offset = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const bytes = zip.subarray(offset, offset + size);
    entries.set(name, method === 8 ? inflateRawSync(bytes) : bytes);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function fixture(): PromotionPackageInput {
  return {
    mod: { id: "fixture", title: "Test mod", game: "Test game", description: "A short description." },
    build: { versionLabel: "1.0", changelog: "Fixed a bug.", fileUrl: "builds/final.zip", uploadedAt: new Date("2026-01-01") },
    requirements: [],
    readStoredFile: async () => ({ data: Buffer.from("archive"), size: 7 }),
    media: [
      { filename: "first.webp", caption: "First scene", readStoredFile: async () => ({ data: Buffer.from("image-one"), size: 9 }) },
      { filename: "second.webp", caption: "Second scene", readStoredFile: async () => ({ data: Buffer.from("image-two"), size: 9 }) },
    ],
  };
}

describe("promotion screenshots", () => {
  it("includes exact final image bytes with ordered names and captions", async () => {
    const result = await buildPromotionPackage(fixture());
    assert.ok(result.ok);
    if (!result.ok) return;
    try {
      const entries = zipEntries(await readFile(result.zipPath));
      assert.equal(entries.get("promotion-test-mod/media/01-first.webp")?.toString(), "image-one");
      assert.equal(entries.get("promotion-test-mod/media/02-second.webp")?.toString(), "image-two");
      assert.match(entries.get("promotion-test-mod/media/captions.txt")!.toString(), /01-first.webp: First scene\n02-second.webp: Second scene/);
      assert.match(entries.get("promotion-test-mod/readme.txt")!.toString(), /2 scanned screenshot/);
    } finally { await result.cleanup(); }
  });
  it("refuses a partial package if an indexed screenshot is missing", async () => {
    const input = fixture();
    input.media![0].readStoredFile = async () => null;
    const result = await buildPromotionPackage(input);
    assert.equal(result.ok, false);
  });
});
