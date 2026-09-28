/**
 * Image validation for the mod media system — PURE.
 *
 * Only PNG, JPEG and WebP are accepted, each with a file-size and dimension
 * ceiling (see lib/pilot.ts for the capacity caps this is separate from).
 * Everything here is a pure function over bytes: no fs, no db, no server-only,
 * so the rules can be unit-tested with crafted headers and reused by the
 * upload server action exactly as-is.
 *
 * `sniffImage` parses enough of each container to prove (a) it really is a PNG
 * / JPEG / WebP and (b) its pixel dimensions — the same bytes that get
 * ClamAV-scanned. A file that fails to sniff is rejected before any byte is
 * stored, so the storage layer never sees a candidate that isn't an image.
 */

export const ACCEPTED_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MiB per image
export const MAX_MEDIA_DIMENSION = 4096; // px, per side
export const MIN_MEDIA_DIMENSION = 160; // px, per side — below this it's not a screenshot

export type SniffedImage = {
  mime: (typeof ACCEPTED_IMAGE_MIMES)[number];
  width: number;
  height: number;
};

export function sniffImage(data: Uint8Array): SniffedImage | null {
  if (data.length < 24) return null;

  const png = sniffPng(data);
  if (png) return png;

  const jpeg = sniffJpeg(data);
  if (jpeg) return jpeg;

  const webp = sniffWebp(data);
  if (webp) return webp;

  return null;
}

function sniffPng(data: Uint8Array): SniffedImage | null {
  // 8-byte signature + 4-byte length + "IHDR" + width(4) + height(4).
  if (data.length < 24) return null;
  const signature = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ];
  for (let i = 0; i < signature.length; i++) {
    if (data[i] !== signature[i]) return null;
  }
  if (
    data[12] !== 0x49 || // I
    data[13] !== 0x48 || // H
    data[14] !== 0x44 || // D
    data[15] !== 0x52    // R
  ) {
    return null;
  }

  const width = readUint32BE(data, 16);
  const height = readUint32BE(data, 20);
  return dimensionsOrNull("image/png", width, height);
}

function sniffJpeg(data: Uint8Array): SniffedImage | null {
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) return null;

  // Walk the marker segments to the first Start-Of-Frame (SOFn), whose header
  // carries the image height/width. Skip Define-Huffman (C4), JPG (C8) and
  // Define-Arithmetic (CC), which share the C0-CF byte range but are not SOF.
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) break;
    const marker = data[offset + 1];

    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS — never saw SOF
    if (marker === 0xff) {
      // Fill byte before a marker; keep scanning.
      offset++;
      continue;
    }

    if (marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      // SOF0..SOF15: precision(1) followed by height(2) then width(2).
      if (offset + 9 > data.length) return null;
      const height = readUint16BE(data, offset + 5);
      const width = readUint16BE(data, offset + 7);
      return dimensionsOrNull("image/jpeg", width, height);
    }

    const segmentLength = readUint16BE(data, offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

function sniffWebp(data: Uint8Array): SniffedImage | null {
  if (data.length < 30) return null;
  if (
    data[0] !== 0x52 || // R
    data[1] !== 0x49 || // I
    data[2] !== 0x46 || // F
    data[3] !== 0x46    // F
  ) {
    return null;
  }
  if (
    data[8] !== 0x57 || // W
    data[9] !== 0x45 || // E
    data[10] !== 0x42 || // B
    data[11] !== 0x50    // P
  ) {
    return null;
  }

  // First chunk header at offset 12.
  const fourcc = String.fromCharCode(data[12], data[13], data[14], data[15]);

  if (fourcc === "VP8X") {
    // Extended: canvas width/height are stored minus one, 24-bit LE, after the
    // 8-byte chunk header + flags/version bytes.
    if (data.length < 30) return null;
    const width = 1 + (data[24] | (data[25] << 8) | (data[26] << 16));
    const height = 1 + (data[27] | (data[28] << 8) | (data[29] << 16));
    return dimensionsOrNull("image/webp", width, height);
  }

  // Payload starts after the 8-byte chunk header.
  const payload = data.subarray(20);

  if (fourcc === "VP8 ") {
    // Lossy: 3-byte sync code (9D 01 2A) then a 4-byte little-endian word with
    // width-1 in the low 14 bits and height-1 in bits 16-29.
    if (payload.length < 7) return null;
    if (payload[0] !== 0x9d || payload[1] !== 0x01 || payload[2] !== 0x2a) {
      return null;
    }
    const raw =
      payload[3] | (payload[4] << 8) | (payload[5] << 16) | (payload[6] << 24);
    const width = 1 + (raw & 0x3fff);
    const height = 1 + ((raw >> 16) & 0x3fff);
    return dimensionsOrNull("image/webp", width, height);
  }

  if (fourcc === "VP8L") {
    // Lossless: 1-byte signature (2F) then a 4-byte little-endian word with
    // width-1 in the low 14 bits and height-1 in bits 14-27.
    if (payload.length < 5) return null;
    if (payload[0] !== 0x2f) return null;
    const raw =
      payload[1] | (payload[2] << 8) | (payload[3] << 16) | (payload[4] << 24);
    const width = 1 + (raw & 0x3fff);
    const height = 1 + ((raw >> 14) & 0x3fff);
    return dimensionsOrNull("image/webp", width, height);
  }

  return null;
}

/** The storage extension for a detected image (never trust the user's name). */
export function mimeExtension(mime: (typeof ACCEPTED_IMAGE_MIMES)[number]): string {
  switch (mime) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
  }
}

function dimensionsOrNull(
  mime: SniffedImage["mime"],
  width: number,
  height: number,
): SniffedImage | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width <= 0 || height <= 0) return null;
  if (width > MAX_MEDIA_DIMENSION || height > MAX_MEDIA_DIMENSION) return null;
  if (width < MIN_MEDIA_DIMENSION || height < MIN_MEDIA_DIMENSION) return null;
  return { mime, width, height };
}

function readUint16BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] << 24) |
    (data[offset + 1] << 16) |
    (data[offset + 2] << 8) |
    data[offset + 3]
  );
}