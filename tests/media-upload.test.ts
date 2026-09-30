import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { decodeMediaImage } from "../lib/image-decode";
import { assertMediaOwner, galleryOrder, MediaCaptionSchema } from "../lib/media-policy";
import { processMediaUpload, type MediaPipelineDependencies } from "../lib/media-upload";
import { sniffImage } from "../lib/image-meta";

describe("media decoding", () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    it(`fully decodes ${format} and emits a still WebP without EXIF`, async () => {
      const original = await sharp({ create: { width: 200, height: 160, channels: 3, background: "#456789" } }).toFormat(format).withMetadata().toBuffer();
      const image = await decodeMediaImage(original);
      assert.equal(image.mime, "image/webp");
      assert.equal(image.width, 200);
      assert.equal(image.height, 160);
      const metadata = await sharp(image.data).metadata();
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.format, "webp");
      assert.deepEqual(sniffImage(image.data), { mime: "image/webp", width: 200, height: 160 });
    });
  }
  it("rejects a plausible PNG header without image data", async () => {
    const original = await sharp({ create: { width: 160, height: 160, channels: 3, background: "red" } }).png().toBuffer();
    assert.ok(sniffImage(original.subarray(0, 24)));
    await assert.rejects(decodeMediaImage(original.subarray(0, 24)), /valid, still/);
  });
  it("rejects SVG and images outside the dimension bounds", async () => {
    await assert.rejects(decodeMediaImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"></svg>')), /valid, still/);
    const small = await sharp({ create: { width: 159, height: 160, channels: 3, background: "red" } }).png().toBuffer();
    await assert.rejects(decodeMediaImage(small), /valid, still/);
    const wide = await sharp({ create: { width: 4097, height: 160, channels: 3, background: "red" } }).png().toBuffer();
    await assert.rejects(decodeMediaImage(wide), /valid, still/);
  });
});

describe("media authorization and presentation", () => {
  it("refuses a non-owner, hidden mod and closed mod", () => {
    assert.throws(() => assertMediaOwner({ ownerId: "a", status: "beta" }, "b"), /owner/);
    for (const status of ["promoted", "abandoned"]) assert.throws(() => assertMediaOwner({ ownerId: "a", status }, "a"), /closed/);
    assert.throws(() => assertMediaOwner({ ownerId: "a", status: "beta", hiddenAt: new Date() }, "a"), /hidden/);
    assert.doesNotThrow(() => assertMediaOwner({ ownerId: "a", status: "beta" }, "a"));
  });
  it("caps captions and chooses the selected cover without mutating stored order", () => {
    assert.equal(MediaCaptionSchema.safeParse("x".repeat(201)).success, false);
    const rows = [{ id: "a", width: 160, height: 160, caption: null, isHero: false, position: 0 }, { id: "b", width: 160, height: 160, caption: null, isHero: true, position: 1 }];
    assert.deepEqual(galleryOrder(rows).map((row) => row.id), ["b", "a"]);
    assert.deepEqual(rows.map((row) => row.id), ["a", "b"]);
  });
});

function harness(overrides: Partial<MediaPipelineDependencies> = {}, publishFails = false) {
  const calls: string[] = [];
  let quarantineCount = 0;
  const deps: MediaPipelineDependencies = {
    sweep: () => 0,
    quarantine: () => { calls.push("quarantine"); return `q${++quarantineCount}`; },
    removeQuarantine: (key) => { calls.push(`remove-${key}`); },
    scan: async () => { calls.push("scan"); return { ok: true }; },
    decode: async () => { calls.push("decode"); return { data: Buffer.from("image"), width: 160, height: 160, mime: "image/webp" }; },
    store: async () => { calls.push("store"); },
    removeStored: async () => { calls.push("remove-final"); },
    ...overrides,
  };
  const input = {
    modId: "test-mod", file: new File(["source"], "fake.png"),
    resizeReservation: async (bytes: number) => { assert.equal(bytes, 5); calls.push("resize"); },
    publish: async () => { calls.push("publish"); if (publishFails) throw new Error("db unavailable"); },
    isPublished: async () => false,
    releaseReservation: async () => { calls.push("release"); },
    retainReservation: async () => { calls.push("retain"); },
  };
  return { calls, deps, input };
}

describe("media quarantine and quota lifecycle", () => {
  it("scans original and normalized bytes before storage and publishing", async () => {
    const { calls, deps, input } = harness();
    await processMediaUpload(input, deps);
    assert.deepEqual(calls, ["quarantine", "scan", "decode", "resize", "quarantine", "scan", "store", "publish", "remove-q1", "remove-q2"]);
  });
  for (const scanResult of [{ ok: false, reason: "infected" }, { ok: false, reason: "not-configured" }, { ok: false, reason: "unavailable", message: "offline" }] as const) {
    it(`does not decode or store when the scanner says ${scanResult.reason}`, async () => {
      const { calls, deps, input } = harness({ scan: async () => scanResult });
      await assert.rejects(processMediaUpload(input, deps));
      assert.deepEqual(calls, ["quarantine", "remove-q1", "release"]);
    });
  }
  it("deletes quarantine and releases quota when image decoding fails", async () => {
    const { calls, deps, input } = harness({ decode: async () => { throw new Error("corrupt"); } });
    await assert.rejects(processMediaUpload(input, deps));
    assert.deepEqual(calls, ["quarantine", "scan", "remove-q1", "release"]);
  });
  it("also blocks a failure of the normalized-image scan", async () => {
    let scans = 0;
    const { calls, deps, input } = harness({ scan: async () => ++scans === 1 ? { ok: true } : { ok: false, reason: "infected" } });
    await assert.rejects(processMediaUpload(input, deps));
    assert.ok(!calls.includes("store"));
    assert.ok(calls.includes("remove-q2"));
    assert.equal(calls.at(-1), "release");
  });
  it("removes final bytes before releasing the charge on DB publish failure", async () => {
    const { calls, deps, input } = harness({}, true);
    await assert.rejects(processMediaUpload(input, deps));
    assert.deepEqual(calls.slice(-2), ["remove-final", "release"]);
  });
  it("retains a permanent charge when failed storage cleanup leaves an orphan", async () => {
    const { calls, deps, input } = harness({ removeStored: async () => { calls.push("remove-final"); throw new Error("R2 unavailable"); } }, true);
    await assert.rejects(processMediaUpload(input, deps));
    assert.deepEqual(calls.slice(-2), ["remove-final", "retain"]);
    assert.ok(!calls.includes("release"));
  });
  it("retains the charge after an unacknowledged PUT even when cleanup succeeds", async () => {
    const { calls, deps, input } = harness({ store: async () => { throw new Error("network lost"); } });
    await assert.rejects(processMediaUpload(input, deps));
    assert.deepEqual(calls.slice(-2), ["remove-final", "retain"]);
    assert.ok(!calls.includes("release"));
    assert.ok(!calls.includes("publish"));
  });
  it("keeps a late remote PUT charged when it completes after cleanup's DELETE", async () => {
    let remoteObjectExists = false;
    let completeRemotePut: (() => void) | undefined;
    const { calls, deps, input } = harness({
      store: async () => {
        // A client-side abort is not proof that the provider cancelled its PUT.
        completeRemotePut = () => { remoteObjectExists = true; };
        throw new Error("client deadline exceeded");
      },
      removeStored: async () => {
        calls.push("remove-final");
        remoteObjectExists = false;
      },
    });
    await assert.rejects(processMediaUpload(input, deps), /client deadline/);
    assert.equal(remoteObjectExists, false, "the early DELETE succeeded");
    assert.ok(completeRemotePut);
    completeRemotePut();
    assert.equal(remoteObjectExists, true, "the provider then completes the in-flight PUT");
    assert.deepEqual(calls.slice(-2), ["remove-final", "retain"]);
    assert.ok(!calls.includes("release"));
    assert.ok(!calls.includes("publish"));
  });
  it("does not delete an image if the transaction committed before its acknowledgement was lost", async () => {
    const { calls, deps, input } = harness({}, true);
    input.isPublished = async () => true;
    await assert.rejects(processMediaUpload(input, deps));
    assert.ok(!calls.includes("remove-final"));
    assert.ok(!calls.includes("release"));
  });
  it("preserves the object and charge when a lost DB connection prevents determining commit outcome", async () => {
    const { calls, deps, input } = harness({}, true);
    input.isPublished = async () => { throw new Error("connection lost"); };
    await assert.rejects(processMediaUpload(input, deps));
    assert.ok(!calls.includes("remove-final"));
    assert.equal(calls.at(-1), "retain");
  });
});
