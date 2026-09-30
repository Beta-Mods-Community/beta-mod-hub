import "server-only";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import type { Readable } from "node:stream";
import { createInflateRaw, type InflateRaw } from "node:zlib";
import { CLOUD_ARCHIVE_MAX_ENTRIES, CLOUD_ARCHIVE_MAX_EXPANDED_BYTES, CLOUD_SCAN_MAX_BYTES, crc32 } from "./cloud-zip";

/**
 * Conservative small-pilot ZIP policy, not a malware verdict. Each approved
 * original still goes through the managed scanner before storage/serving.
 * yauzl lazyEntries + validateEntrySizes are documented at:
 * https://github.com/thejoshwolfe/yauzl#openpath-options-callback
 * yauzl intentionally does not validate CRC32, so this policy does it itself.
 */
export type CloudArchiveValidation =
  | { ok: true; entries: number; expandedBytes: number }
  | { ok: false; reason: "invalid-archive"; message: string };

class ArchivePolicyError extends Error {}
const reject = (message: string): never => { throw new ArchivePolicyError(message); };
const MALFORMED = "This ZIP is malformed or uses unsupported metadata. Re-create a standard ZIP and try again.";
const NESTED = "Nested archives and packed game containers are not supported in the small cloud pilot. Upload an unpacked ZIP instead.";
const ARCHIVE_EXTENSION = /\.(?:zip|zipx|7z|rar|tar|tgz|gz|gzip|bz2|tbz|tbz2|xz|txz|zst|zstd|lz|lzma|lz4|cab|iso|jar|war|ear|apk|aab|epub|docx|xlsx|pptx|odt|ods|odp|pak|bsa|ba2|asar)$/i;
const EMBEDDED_MAGIC = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x06, 0x06]), Buffer.from("Rar!\x1a\x07", "binary"),
  Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
];

type LayoutEntry = { offset: number; size: number; compressed: number; crc: number; flags: number; method: number; end: number };
function uint32(data: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > data.length) return reject(MALFORMED);
  return data.readUInt32LE(offset);
}

/** Only bounded timestamp / uid-gid extras; no ZIP64, encryption or opaque blobs. */
function validateExtras(extra: Buffer): void {
  for (let offset = 0; offset < extra.length;) {
    if (offset + 4 > extra.length) reject(MALFORMED);
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > extra.length) reject(MALFORMED);
    const field = extra.subarray(offset, offset + size);
    if (id === 0x5455) {
      if (size < 1 || size > 13 || (size - 1) % 4 !== 0 || (field[0] & ~7) !== 0) reject(MALFORMED);
    } else if (id === 0x7875) {
      if (size < 5 || size > 11 || field[0] !== 1 || field[1] < 1 || field[1] > 4) reject(MALFORMED);
      const gid = 2 + field[1];
      if (gid >= size || field[gid] < 1 || field[gid] > 4 || gid + 1 + field[gid] !== size) reject(MALFORMED);
    } else {
      reject(MALFORMED);
    }
    offset += size;
  }
}

/**
 * Validate both copies of ZIP metadata, exact member coverage and descriptors.
 * Reject comments, preambles, trailing payloads, overlaps and unsupported extras
 * so the parser and AV engine do not get two different views of the archive.
 */
function validateLayout(data: Buffer): Map<number, LayoutEntry> {
  if (data.length < 22 || data.length > CLOUD_SCAN_MAX_BYTES) reject("Cloud pilot builds must be ZIP files no larger than 8 MiB.");
  const end = data.length - 22;
  if (uint32(data, end) !== 0x06054b50 || data.readUInt16LE(end + 20) !== 0) reject(MALFORMED);
  if (data.readUInt16LE(end + 4) !== 0 || data.readUInt16LE(end + 6) !== 0) reject(MALFORMED);
  const count = data.readUInt16LE(end + 10);
  if (count !== data.readUInt16LE(end + 8) || count === 0 || count > CLOUD_ARCHIVE_MAX_ENTRIES) reject("A cloud pilot ZIP must contain between 1 and 256 entries.");
  const centralSize = uint32(data, end + 12);
  const centralStart = uint32(data, end + 16);
  if (centralStart + centralSize !== end || centralStart === 0) reject(MALFORMED);
  const records = new Map<number, LayoutEntry>();
  let cursor = centralStart;
  let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || uint32(data, cursor) !== 0x02014b50) reject(MALFORMED);
    const version = data.readUInt16LE(cursor + 6);
    const flags = data.readUInt16LE(cursor + 8);
    const method = data.readUInt16LE(cursor + 10);
    const checksum = uint32(data, cursor + 16);
    const compressed = uint32(data, cursor + 20);
    const size = uint32(data, cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    const offset = uint32(data, cursor + 42);
    if ((flags & 1) !== 0 || (flags & 0x40) !== 0) reject("Encrypted ZIP files are not supported. Remove the password and try again.");
    if (version > 20 || (flags & ~0x080e) !== 0 || ![0, 8].includes(method) || method === 0 && (flags & 6) !== 0 || commentLength !== 0 || data.readUInt16LE(cursor + 34) !== 0) reject(MALFORMED);
    if (nameLength === 0 || nameLength > 512 || cursor + 46 + nameLength + extraLength > end) reject(MALFORMED);
    if (size > CLOUD_SCAN_MAX_BYTES || compressed > CLOUD_SCAN_MAX_BYTES) reject("Each file inside the ZIP must be no larger than 8 MiB.");
    expanded += size;
    if (expanded > CLOUD_ARCHIVE_MAX_EXPANDED_BYTES) reject("The ZIP must expand to no more than 32 MiB in total.");
    validateExtras(data.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength));
    if (offset + 30 > centralStart || uint32(data, offset) !== 0x04034b50 || records.has(offset)) reject(MALFORMED);
    const localNameLength = data.readUInt16LE(offset + 26);
    const localExtraLength = data.readUInt16LE(offset + 28);
    const payloadStart = offset + 30 + localNameLength + localExtraLength;
    if (payloadStart + compressed > centralStart || localNameLength !== nameLength || data.readUInt16LE(offset + 4) !== version || data.readUInt16LE(offset + 6) !== flags || data.readUInt16LE(offset + 8) !== method) reject(MALFORMED);
    if (!data.subarray(offset + 30, offset + 30 + localNameLength).equals(data.subarray(cursor + 46, cursor + 46 + nameLength))) reject(MALFORMED);
    validateExtras(data.subarray(offset + 30 + localNameLength, payloadStart));
    const localCrc = uint32(data, offset + 14);
    const localCompressed = uint32(data, offset + 18);
    const localSize = uint32(data, offset + 22);
    let memberEnd = payloadStart + compressed;
    if ((flags & 8) !== 0) {
      if (localCrc !== 0 && localCrc !== checksum || localCompressed !== 0 && localCompressed !== compressed || localSize !== 0 && localSize !== size) reject(MALFORMED);
      if (uint32(data, memberEnd) === 0x08074b50) memberEnd += 4;
      if (memberEnd + 12 > centralStart || uint32(data, memberEnd) !== checksum || uint32(data, memberEnd + 4) !== compressed || uint32(data, memberEnd + 8) !== size) reject(MALFORMED);
      memberEnd += 12;
    } else if (localCrc !== checksum || localCompressed !== compressed || localSize !== size) reject(MALFORMED);
    records.set(offset, { offset, size, compressed, crc: checksum, flags, method, end: memberEnd });
    cursor += 46 + nameLength + extraLength;
  }
  if (cursor !== end) reject(MALFORMED);
  let nextOffset = 0;
  for (const entry of [...records.values()].sort((a, b) => a.offset - b.offset)) {
    if (entry.offset !== nextOffset) reject(MALFORMED);
    nextOffset = entry.end;
  }
  if (nextOffset !== centralStart) reject(MALFORMED);
  return records;
}

function inspectName(entry: Entry, seen: Map<string, boolean>): void {
  const name = entry.fileName;
  const parts = name.replace(/\/$/, "").split("/");
  if (name.length > 512 || /[\x00-\x1f\x7f\\:]/.test(name) || name.startsWith("/") || parts.some(part => !part || part === "." || part === ".." || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) reject("The ZIP contains an unsafe or unsupported file path.");
  const normalized = name.replace(/\/$/, "").normalize("NFC").toLowerCase();
  if (seen.has(normalized)) reject("The ZIP contains duplicate or conflicting paths.");
  const directory = name.endsWith("/");
  for (const [previous, isDirectory] of seen) {
    if (!isDirectory && normalized.startsWith(`${previous}/`) || !directory && previous.startsWith(`${normalized}/`)) reject("The ZIP contains duplicate or conflicting paths.");
  }
  seen.set(normalized, directory);
  const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
  if (mode !== 0 && mode !== 0x8000 && mode !== 0x4000) reject("Links and special files are not supported in cloud pilot ZIPs.");
  if (mode === 0x4000 && !directory || mode === 0x8000 && directory || directory && entry.uncompressedSize !== 0) reject(MALFORMED);
  if (!directory && ARCHIVE_EXTENSION.test(name)) reject(NESTED);
}

function archivePrefix(prefix: Buffer): boolean {
  return prefix.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))
    || prefix.subarray(0, 3).equals(Buffer.from("BZh"))
    || prefix.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0]))
    || prefix.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))
    || prefix.subarray(0, 4).equals(Buffer.from([4, 0x22, 0x4d, 0x18]))
    || ["MSCF", "BSA\0", "BTDX", "PACK"].some(magic => prefix.subarray(0, 4).equals(Buffer.from(magic, "binary")))
    || prefix.subarray(257, 262).equals(Buffer.from("ustar"));
}

/** No extraction to disk; one decompressed stream at a time with a bounded prefix. */
export async function validateCloudArchive(input: Uint8Array): Promise<CloudArchiveValidation> {
  try {
    const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    const layout = validateLayout(data);
    return await new Promise<CloudArchiveValidation>((resolve) => {
      let zip: ZipFile | undefined;
      let stream: Readable | undefined;
      let source: Readable | undefined;
      let settled = false;
      let count = 0;
      let fileCount = 0;
      let expanded = 0;
      const seen = new Map<string, boolean>();
      const finish = (result: CloudArchiveValidation) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stream?.destroy();
        source?.destroy();
        zip?.close();
        resolve(result);
      };
      const fail = (error?: unknown) => finish({ ok: false, reason: "invalid-archive", message: error instanceof ArchivePolicyError ? error.message : MALFORMED });
      const timer = setTimeout(() => fail(new ArchivePolicyError("This ZIP took too long to validate. Use a smaller, simpler archive.")), 10_000);
      fromBuffer(data, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, result) => {
        if (error || !result) return fail();
        zip = result;
        if (settled) { zip.close(); return; }
        zip.on("error", fail);
        zip.on("end", () => {
          if (count !== layout.size || fileCount === 0) return fail();
          finish({ ok: true, entries: count, expandedBytes: expanded });
        });
        zip.on("entry", (entry: Entry) => {
          void (async () => {
            if (settled) return;
            count++;
            if (count > CLOUD_ARCHIVE_MAX_ENTRIES) reject(MALFORMED);
            const record = layout.get(entry.relativeOffsetOfLocalHeader);
            if (!record || record.size !== entry.uncompressedSize || record.compressed !== entry.compressedSize || record.crc !== entry.crc32 || record.method !== entry.compressionMethod || record.flags !== entry.generalPurposeBitFlag) reject(MALFORMED);
            inspectName(entry, seen);
            if (!entry.fileName.endsWith("/")) fileCount++;
            source = await new Promise<Readable>((yes, no) => zip!.openReadStream(entry, entry.compressionMethod === 8 ? { decompress: false } : {}, (streamError, raw) => streamError || !raw ? no(streamError) : yes(raw)));
            if (settled) { source.destroy(); return; }
            let inflater: InflateRaw | undefined;
            if (entry.compressionMethod === 8) {
              inflater = createInflateRaw();
              source.once("error", error => inflater!.destroy(error));
              stream = source.pipe(inflater);
            } else stream = source;
            let size = 0;
            let checksum = 0;
            let prefix = Buffer.alloc(0);
            let tail = Buffer.alloc(0);
            for await (const chunk of stream) {
              const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              size += bytes.length;
              expanded += bytes.length;
              if (size > CLOUD_SCAN_MAX_BYTES || size > entry.uncompressedSize || expanded > CLOUD_ARCHIVE_MAX_EXPANDED_BYTES) reject("The ZIP exceeds the cloud pilot's expanded-size limits.");
              checksum = crc32(bytes, checksum);
              if (prefix.length < 512) prefix = Buffer.concat([prefix, bytes.subarray(0, 512 - prefix.length)]);
              const boundary = Buffer.concat([tail, bytes]);
              if (EMBEDDED_MAGIC.some(magic => boundary.includes(magic)) || archivePrefix(prefix)) reject(NESTED);
              tail = Buffer.from(boundary.subarray(-7));
            }
            // zlib accepts trailing bytes after a complete deflate stream. Such
            // bytes are not covered by the uncompressed CRC and must not pass.
            // https://nodejs.org/api/zlib.html#zlibbyteswritten
            if (inflater && inflater.bytesWritten !== entry.compressedSize) reject(MALFORMED);
            stream = undefined;
            source.destroy();
            source = undefined;
            if (size !== entry.uncompressedSize || checksum !== entry.crc32) reject("The ZIP failed its integrity check. Re-create the ZIP and try again.");
            if (!settled) zip!.readEntry();
          })().catch(fail);
        });
        zip.readEntry();
      });
    });
  } catch (error) {
    return { ok: false, reason: "invalid-archive", message: error instanceof ArchivePolicyError ? error.message : MALFORMED };
  }
}
