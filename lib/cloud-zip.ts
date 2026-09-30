/** ZIP primitives shared by the bounded cloud scanner and archive policy. */
export const CLOUD_SCAN_MAX_BYTES = 8 * 1024 * 1024;
export const CLOUD_ARCHIVE_MAX_EXPANDED_BYTES = 32 * 1024 * 1024;
export const CLOUD_ARCHIVE_MAX_ENTRIES = 256;

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

/** Pass the previous finalized CRC to update it with another bounded chunk. */
export function crc32(bytes: Uint8Array, previous = 0): number {
  let crc = (previous ^ 0xffffffff) >>> 0;
  for (const byte of bytes) crc = ((crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

export const SCAN_ENVELOPE_NAME = "scan-envelope.zip";
const ENTRY_NAME = Buffer.from("payload.bin", "ascii");
export const SCAN_ENVELOPE_OVERHEAD = 30 + 46 + 22 + 2 * ENTRY_NAME.length;

/**
 * A single, uncompressed, server-named ZIP member. This preserves exact bytes
 * and prevents Community-plan image transformation before the hash step.
 * No user filename, comment, extra field, filesystem path or ZIP64 is involved.
 */
export function createScanEnvelope(data: Uint8Array): Buffer {
  if (data.byteLength === 0 || data.byteLength > CLOUD_SCAN_MAX_BYTES) {
    throw new Error("cloud-scan-size-limit");
  }
  const checksum = crc32(data);
  const result = Buffer.alloc(data.byteLength + SCAN_ENVELOPE_OVERHEAD);
  const central = 30 + ENTRY_NAME.length + data.byteLength;
  result.writeUInt32LE(0x04034b50, 0);
  result.writeUInt16LE(20, 4);
  result.writeUInt16LE(0x0021, 12); // 1980-01-01, deterministic DOS date.
  result.writeUInt32LE(checksum, 14);
  result.writeUInt32LE(data.byteLength, 18);
  result.writeUInt32LE(data.byteLength, 22);
  result.writeUInt16LE(ENTRY_NAME.length, 26);
  ENTRY_NAME.copy(result, 30);
  result.set(data, 30 + ENTRY_NAME.length);
  result.writeUInt32LE(0x02014b50, central);
  result.writeUInt16LE(20, central + 4);
  result.writeUInt16LE(20, central + 6);
  result.writeUInt16LE(0x0021, central + 14);
  result.writeUInt32LE(checksum, central + 16);
  result.writeUInt32LE(data.byteLength, central + 20);
  result.writeUInt32LE(data.byteLength, central + 24);
  result.writeUInt16LE(ENTRY_NAME.length, central + 28);
  ENTRY_NAME.copy(result, central + 46);
  const end = central + 46 + ENTRY_NAME.length;
  result.writeUInt32LE(0x06054b50, end);
  result.writeUInt16LE(1, end + 8);
  result.writeUInt16LE(1, end + 10);
  result.writeUInt32LE(46 + ENTRY_NAME.length, end + 12);
  result.writeUInt32LE(central, end + 16);
  return result;
}
