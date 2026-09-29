import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mimeExtension,
  sniffImage,
  MAX_MEDIA_DIMENSION,
  MIN_MEDIA_DIMENSION,
} from "../lib/image-meta";

/**
 * The image gate for the mod media pipeline, exercised with crafted headers.
 *
 * These fixtures test header inspection only. Real image decoding, metadata
 * removal, corruption rejection and the scan-before-store boundary are
 * covered by media-upload.test.ts; headers alone never authorize publishing.
 */

/** A minimal PNG with the given dimensions: signature + IHDR. */
function png(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length
  buf.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  buf.set([(width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff], 16);
  buf.set([(height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff], 20);
  return buf;
}

/** A minimal JPEG: SOI + an APP0 + an SOF0 carrying the dimensions. */
function jpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const sof0 = [
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ];
  const buf = new Uint8Array([0xff, 0xd8, ...app0, ...sof0]);
  return buf;
}

/** A minimal WebP with a VP8X extended header carrying the canvas size. */
function webp(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(30);
  buf.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  buf.set([0x16, 0x00, 0x00, 0x00], 4); // chunk size (unused by the sniffer)
  buf.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  buf.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  buf.set([0x0a, 0x00, 0x00, 0x00], 16); // chunk size
  buf[20] = 0x00; // flags
  buf[21] = buf[22] = buf[23] = 0x00; // reserved
  const wm1 = width - 1;
  const hm1 = height - 1;
  buf[24] = wm1 & 0xff;
  buf[25] = (wm1 >>> 8) & 0xff;
  buf[26] = (wm1 >>> 16) & 0xff;
  buf[27] = hm1 & 0xff;
  buf[28] = (hm1 >>> 8) & 0xff;
  buf[29] = (hm1 >>> 16) & 0xff;
  return buf;
}

describe("sniffImage: PNG", () => {
  it("recognises a real PNG header and reads its dimensions", () => {
    assert.deepEqual(sniffImage(png(1672, 941)), {
      mime: "image/png",
      width: 1672,
      height: 941,
    });
  });

  it("rejects bytes that only look PNG-ish", () => {
    const fake = png(100, 100);
    fake[3] = 0x00; // corrupt the signature's 'G'
    assert.equal(sniffImage(fake), null);
  });
});

describe("sniffImage: JPEG", () => {
  it("walks segments to the SOF and reads the dimensions", () => {
    assert.deepEqual(sniffImage(jpeg(1920, 1080)), {
      mime: "image/jpeg",
      width: 1920,
      height: 1080,
    });
  });

  it("does not mistake a Define-Huffman table (C4) for an SOF", () => {
    // The C4 marker shares the C0-CF byte range with SOF0; a parser that does
    // not skip it reads the huffman table body as width/height.
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x03, 0x20, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00]);
    assert.deepEqual(sniffImage(buf), {
      mime: "image/jpeg",
      width: 800,
      height: 1200,
    });
  });

  it("rejects a non-JPEG FF D8 FF prefix", () => {
    assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])), null);
  });

  it("returns null when no SOF is found before the scan data", () => {
    // Twelve bytes of entropy after SOI, no structured marker — junk, not a jpg.
    assert.equal(
      sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0x01, 1, 2, 3, 4, 5, 6, 7, 8])),
      null,
    );
  });
});

describe("sniffImage: WebP", () => {
  it("reads the VP8X canvas width/height (stored minus one)", () => {
    assert.deepEqual(sniffImage(webp(800, 600)), {
      mime: "image/webp",
      width: 800,
      height: 600,
    });
  });

  it("rejects a RIFF that is not WEBP", () => {
    const buf = webp(100, 100);
    buf.set([0x41, 0x56, 0x49, 0x20], 8); // "AVI "
    assert.equal(sniffImage(buf), null);
  });
});

describe("sniffImage: dimensions and size policy", () => {
  it("rejects images above the per-side pixel ceiling", () => {
    assert.equal(sniffImage(png(MAX_MEDIA_DIMENSION + 1, 400)), null);
    assert.equal(sniffImage(png(400, MAX_MEDIA_DIMENSION + 1)), null);
  });

  it("rejects images below the screenshot floor", () => {
    assert.equal(sniffImage(png(MIN_MEDIA_DIMENSION - 1, 400)), null);
    assert.equal(sniffImage(webp(400, MIN_MEDIA_DIMENSION - 1)), null);
  });

  it("accepts images exactly at the boundaries", () => {
    assert.ok(sniffImage(png(MAX_MEDIA_DIMENSION, MAX_MEDIA_DIMENSION)));
    assert.ok(sniffImage(webp(MIN_MEDIA_DIMENSION, MIN_MEDIA_DIMENSION)));
  });

  it("rejects zero or negative dimensions and truncated buffers", () => {
    assert.equal(sniffImage(png(0, 400)), null);
    assert.equal(sniffImage(png(400, -1)), null);
    assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  });
});

describe("sniffImage: rejects non-images outright", () => {
  it("returns null for plain text and arbitrary bytes", () => {
    assert.equal(sniffImage(new TextEncoder().encode("hello world")), null);
    const random = new Uint8Array(64);
    for (let i = 0; i < random.length; i++) random[i] = (i * 37) & 0xff;
    assert.equal(sniffImage(random), null);
  });
});

describe("mimeExtension", () => {
  it("maps each accepted mime to the storage extension", () => {
    assert.equal(mimeExtension("image/png"), ".png");
    assert.equal(mimeExtension("image/jpeg"), ".jpg");
    assert.equal(mimeExtension("image/webp"), ".webp");
  });
});
