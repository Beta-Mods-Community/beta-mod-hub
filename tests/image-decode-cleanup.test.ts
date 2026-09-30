import assert from "node:assert/strict";
import { mock, test } from "node:test";
import sharp from "sharp";
import { decodeMediaImage } from "../lib/image-decode";

/** Observe the public stream lifecycle; the real decoder and destroy still run. */
async function observesDestroyed(run: () => Promise<unknown>) {
  const observer = mock.method(sharp.prototype, "destroy");
  try {
    await run();
    assert.ok(observer.mock.callCount() >= 1, "each constructed decode pipeline must be closed");
    for (const call of observer.mock.calls) assert.equal((call.this as ReturnType<typeof sharp>).destroyed, true);
  } finally { observer.mock.restore(); }
}

test("successful real decode closes its Sharp stream without changing encoding or alpha", async () => {
  const original = await sharp({ create: { width: 200, height: 160, channels: 4, background: { r: 42, g: 71, b: 99, alpha: 0.5 } } }).png().toBuffer();
  const baselinePipeline = sharp(original, { failOn: "warning", limitInputPixels: 4096 * 4096, animated: true });
  let expected: Buffer;
  try { expected = await baselinePipeline.rotate().webp({ quality: 88 }).toBuffer(); }
  finally { baselinePipeline.destroy(); }
  await observesDestroyed(async () => {
    const result = await decodeMediaImage(original);
    assert.deepEqual(result.data, expected);
    assert.deepEqual([result.width, result.height, result.mime], [200, 160, "image/webp"]);
  });
});

test("metadata/decode failure closes the actual malformed-image pipeline", async () => {
  await observesDestroyed(() => assert.rejects(decodeMediaImage(Buffer.from("not an image")), /valid, still/));
});

test("format-policy refusal closes an otherwise parseable image pipeline", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"></svg>');
  await observesDestroyed(() => assert.rejects(decodeMediaImage(svg), /valid, still/));
});

test("dimension-policy refusal closes a fully parseable small-image pipeline", async () => {
  const original = await sharp({ create: { width: 159, height: 160, channels: 3, background: "#246789" } }).png().toBuffer();
  await observesDestroyed(() => assert.rejects(decodeMediaImage(original), /valid, still/));
});

test("pre-decode byte refusal creates no pipeline that needs closing", async () => {
  const observer = mock.method(sharp.prototype, "destroy");
  try {
    await assert.rejects(decodeMediaImage(Buffer.alloc(0)), /Choose an image/);
    assert.equal(observer.mock.callCount(), 0);
  } finally { observer.mock.restore(); }
});
