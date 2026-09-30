import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { CLOUD_IMAGE_PIXELS, CLOUD_UPLOAD_BYTES } from "../lib/cloud-pilot";
import { decodeMediaImage } from "../lib/image-decode";
import { MAX_MEDIA_BYTES } from "../lib/image-meta";
import { processMediaUpload, type MediaPipelineDependencies } from "../lib/media-upload";

/** File-level test isolation plus finally restores the only environment override. */
async function cloudMode<T>(mode: "on" | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env.CLOUD_PILOT;
  if (mode === undefined) delete process.env.CLOUD_PILOT;
  else process.env.CLOUD_PILOT = mode;
  try { return await run(); }
  finally {
    if (previous === undefined) delete process.env.CLOUD_PILOT;
    else process.env.CLOUD_PILOT = previous;
  }
}

class ObservedFile extends File {
  reads = 0;
  override async arrayBuffer(): Promise<ArrayBuffer> {
    this.reads++;
    return super.arrayBuffer();
  }
}

function harness(file: File, canonicalSize = 5) {
  const calls: string[] = [];
  let quarantineCount = 0;
  const deps: MediaPipelineDependencies = {
    sweep: () => { calls.push("sweep"); return 0; },
    quarantine: () => { calls.push("quarantine"); return `q${++quarantineCount}`; },
    removeQuarantine: key => { calls.push(`remove-${key}`); },
    scan: async () => { calls.push("scan"); return { ok: true }; },
    decode: async () => { calls.push("decode"); return { data: Buffer.alloc(canonicalSize), width: 160, height: 160, mime: "image/webp" }; },
    store: async () => { calls.push("store"); },
    removeStored: async () => { calls.push("remove-stored"); },
  };
  const input = {
    modId: "synthetic-media-policy-test", file,
    resizeReservation: async (bytes: number) => { assert.equal(bytes, canonicalSize); calls.push("resize"); },
    publish: async () => { calls.push("publish"); },
    isPublished: async () => false,
    releaseReservation: async () => { calls.push("release"); },
    retainReservation: async () => { calls.push("retain"); },
  };
  return { calls, deps, input };
}

describe("cloud pilot media limits", { concurrency: false }, () => {
  it("rejects original images over 8 MiB before arrayBuffer, quarantine or scanning", async () => cloudMode("on", async () => {
    const file = new ObservedFile([Buffer.alloc(CLOUD_UPLOAD_BYTES + 1)], "oversize.png");
    const { calls, deps, input } = harness(file);
    await assert.rejects(processMediaUpload(input, deps), /8 MiB/);
    assert.equal(file.reads, 0);
    assert.deepEqual(calls, ["release"]);
  }));

  it("accepts the exact 8 MiB original boundary and scans original plus canonical bytes", async () => cloudMode("on", async () => {
    const file = new ObservedFile([Buffer.alloc(CLOUD_UPLOAD_BYTES)], "boundary.png");
    const { calls, deps, input } = harness(file);
    await processMediaUpload(input, deps);
    assert.equal(file.reads, 1);
    assert.deepEqual(calls, ["sweep", "quarantine", "scan", "decode", "resize", "quarantine", "scan", "store", "publish", "remove-q1", "remove-q2"]);
  }));

  it("rejects a canonical image over 8 MiB before its scan, quota resize or storage", async () => cloudMode("on", async () => {
    const { calls, deps, input } = harness(new File(["small synthetic source"], "input.png"), CLOUD_UPLOAD_BYTES + 1);
    await assert.rejects(processMediaUpload(input, deps), /processed image exceeds/);
    assert.equal(calls.filter(call => call === "scan").length, 1, "only original bytes may have been scanned");
    assert.deepEqual(calls, ["sweep", "quarantine", "scan", "decode", "remove-q1", "release"]);
  }));

  it("the real decoder rejects input bytes over its cloud limit before parsing", async () => cloudMode("on", async () => {
    await assert.rejects(decodeMediaImage(Buffer.alloc(CLOUD_UPLOAD_BYTES + 1)), /Choose an image no larger than 8 MiB/);
  }));

  it("the real Sharp decoder accepts the exact 8,388,608-pixel cloud boundary", async () => cloudMode("on", async () => {
    assert.equal(CLOUD_IMAGE_PIXELS, 4096 * 2048);
    const original = await sharp({ create: { width: 4096, height: 2048, channels: 3, background: "#246789" } }).png().toBuffer();
    assert.ok(original.length < CLOUD_UPLOAD_BYTES);
    const result = await decodeMediaImage(original);
    assert.equal(result.width * result.height, CLOUD_IMAGE_PIXELS);
    assert.equal(result.mime, "image/webp");
  }));

  it("Sharp rejects 8.4 million pixels in cloud mode but preserves the local decoder limit", async () => {
    const original = await sharp({ create: { width: 3000, height: 2800, channels: 3, background: "#246789" } }).png().toBuffer();
    assert.ok(3000 * 2800 > CLOUD_IMAGE_PIXELS);
    assert.ok(original.length < CLOUD_UPLOAD_BYTES);
    await cloudMode("on", async () => {
      await assert.rejects(decodeMediaImage(original), /valid, still/);
    });
    await cloudMode(undefined, async () => {
      const result = await decodeMediaImage(original);
      assert.deepEqual([result.width, result.height], [3000, 2800]);
    });
  });

  it("local default remains 10 MiB, including exact-boundary acceptance", async () => cloudMode(undefined, async () => {
    assert.equal(MAX_MEDIA_BYTES, 10 * 1024 * 1024);
    const file = new ObservedFile([Buffer.alloc(MAX_MEDIA_BYTES)], "local-boundary.png");
    const accepted = harness(file);
    await processMediaUpload(accepted.input, accepted.deps);
    assert.equal(file.reads, 1);
    assert.ok(accepted.calls.includes("publish"));
    const oversized = new ObservedFile([Buffer.alloc(MAX_MEDIA_BYTES + 1)], "too-large.png");
    const refused = harness(oversized);
    await assert.rejects(processMediaUpload(refused.input, refused.deps), /10 MiB/);
    assert.equal(oversized.reads, 0);
    assert.deepEqual(refused.calls, ["release"]);
  }));

  it("restores CLOUD_PILOT after assertions and failures", async () => {
    const original = process.env.CLOUD_PILOT;
    await assert.rejects(cloudMode("on", async () => { throw new Error("synthetic test failure"); }));
    assert.equal(process.env.CLOUD_PILOT, original);
  });
});
