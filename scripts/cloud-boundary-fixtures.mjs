#!/usr/bin/env node
/**
 * Separate offline-only size/pixel/declared-ZIP-limit fixtures. No network,
 * credentials, scanner, app DB, real files, extraction, or hosted uploads.
 * Default is self-test only; --write-temp saves verified buffers to a new dir.
 * node --conditions=react-server --import tsx scripts/cloud-boundary-fixtures.mjs
 */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { validateBuildArchive } from '../lib/build-upload-policy.ts';
import { validateCloudArchive } from '../lib/cloud-archive.ts';
import { crc32 } from '../lib/cloud-zip.ts';
import { decodeMediaImage } from '../lib/image-decode.ts';
import { cloudRequestPolicy } from './cloud-runtime-policy.mjs';

export const BOUNDARY_LIMITS = Object.freeze({ file: 8 * 1024 * 1024, body: 9 * 1024 * 1024, pixels: 4 * 1024 * 1024, expanded: 32 * 1024 * 1024 });
const EXPECTATIONS = Object.freeze([
  Object.freeze({ name: '01-file-over-8mib.zip', kind: 'file-size', expected: 'This archive is 8 MiB; the limit is 8 MiB.', attempts: 0, scans: 0 }),
  Object.freeze({ name: '02-http-body-over-9mib.zip', kind: 'body-size', expected: 'HTTP 413 before Next form parsing', attempts: 0, scans: 0 }),
  Object.freeze({ name: '03-image-over-4mp.png', kind: 'pixels', expected: 'Use a valid, still PNG, JPEG or WebP image between 160 and 4096 pixels on each side, up to 8 MiB and 4 megapixels.', attempts: 1, scans: 1 }),
  Object.freeze({ name: '04-member-declared-over-8mib.zip', kind: 'member-size', expected: 'Each file inside the ZIP must be no larger than 8 MiB.', attempts: 1, scans: 0 }),
  Object.freeze({ name: '05-total-declared-over-32mib.zip', kind: 'expanded-size', expected: 'The ZIP must expand to no more than 32 MiB in total.', attempts: 1, scans: 0 }),
]);

export function parseBoundaryArgs(args) {
  if (args.length === 0) return { help: false, writeTemp: false };
  if (args.length === 1 && args[0] === '--help') return { help: true, writeTemp: false };
  if (args.length === 1 && args[0] === '--write-temp') return { help: false, writeTemp: true };
  throw new Error('Only --help, --write-temp, or no arguments are supported');
}

/** STORED payloads only: declared-size probes have tiny real contents, no deflate. */
function storedZip(files) {
  const local = []; const central = []; let offset = 0;
  for (const [index, file] of files.entries()) {
    const name = Buffer.from(`fixture-${index}.txt`, 'ascii');
    const checksum = crc32(file.bytes);
    const size = file.declaredSize ?? file.bytes.length;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(file.bytes.length, 18);
    header.writeUInt32LE(size, 22); header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(file.bytes.length, 20);
    directory.writeUInt32LE(size, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, name, file.bytes); central.push(directory, name);
    offset += 30 + name.length + file.bytes.length;
  }
  const directory = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function sizedZip(totalBytes) {
  const overhead = 30 + 46 + 22 + 2 * Buffer.byteLength('fixture-0.txt');
  return storedZip([{ bytes: Buffer.alloc(totalBytes - overhead, 0x61) }]);
}

export async function createBoundaryFixtures() {
  const png = await sharp({ create: { width: 2049, height: 2048, channels: 3, background: '#246789' } })
    .png({ compressionLevel: 6 }).toBuffer();
  const tiny = Buffer.from('a');
  const buffers = [
    sizedZip(BOUNDARY_LIMITS.file + 1), sizedZip(BOUNDARY_LIMITS.body + 1), png,
    storedZip([{ bytes: tiny, declaredSize: BOUNDARY_LIMITS.file + 1 }]),
    storedZip(Array.from({ length: 5 }, (_, index) => ({ bytes: tiny, declaredSize: index < 4 ? BOUNDARY_LIMITS.file : 1 }))),
  ];
  return EXPECTATIONS.map((expected, index) => ({ ...expected, bytes: buffers[index] }));
}

export async function serializedFixtureBodyBytes(fixture) {
  const form = new FormData();
  form.append('$ACTION_ID_' + '0'.repeat(40), '');
  form.append('betaModId', '00000000-0000-4000-8000-000000000000');
  form.append('versionLabel', 'boundary-test'); form.append('changelog', 'Harmless synthetic boundary check.');
  form.append('file', new Blob([fixture.bytes], { type: 'application/zip' }), fixture.name);
  // Serializes locally only. The reserved invalid origin is never requested.
  return (await new Request('https://boundary.invalid/', { method: 'POST', body: form }).arrayBuffer()).byteLength;
}

/** Inspect only our STORED fixture metadata; never extract or inflate it. */
export function declaredZipSizes(data) {
  assert.ok(Buffer.isBuffer(data) && data.length >= 22 && data.length <= BOUNDARY_LIMITS.body + 1);
  const end = data.length - 22;
  assert.equal(data.readUInt32LE(end), 0x06054b50);
  const count = data.readUInt16LE(end + 10); assert.ok(count > 0 && count <= 5);
  let cursor = data.readUInt32LE(end + 16); const entries = [];
  for (let index = 0; index < count; index++) {
    assert.ok(cursor + 46 <= end); assert.equal(data.readUInt32LE(cursor), 0x02014b50);
    assert.equal(data.readUInt16LE(cursor + 10), 0, 'No compressed payloads are permitted');
    const local = data.readUInt32LE(cursor + 42); assert.equal(data.readUInt32LE(local), 0x04034b50);
    assert.equal(data.readUInt16LE(local + 8), 0);
    const actual = data.readUInt32LE(cursor + 20); const declared = data.readUInt32LE(cursor + 24);
    assert.equal(data.readUInt32LE(local + 18), actual); assert.equal(data.readUInt32LE(local + 22), declared);
    entries.push({ actualBytes: actual, declaredBytes: declared, method: 0 });
    cursor += 46 + data.readUInt16LE(cursor + 28);
  }
  assert.equal(cursor, end);
  return entries;
}

/** @param {Awaited<ReturnType<typeof createBoundaryFixtures>>} [fixtures] */
export async function selfTestBoundaryFixtures(fixtures) {
  fixtures ??= await createBoundaryFixtures();
  assert.equal(fixtures.length, EXPECTATIONS.length);
  const results = [];
  for (const [index, fixture] of fixtures.entries()) {
    const expected = EXPECTATIONS[index];
    for (const key of ['name', 'kind', 'expected', 'attempts', 'scans']) assert.equal(fixture[key], expected[key]);
    assert.ok(Buffer.isBuffer(fixture.bytes) && fixture.bytes.length > 0 && fixture.bytes.length <= BOUNDARY_LIMITS.body + 1);
    if (fixture.kind === 'file-size' || fixture.kind === 'body-size') {
      assert.equal(fixture.bytes.length, (fixture.kind === 'file-size' ? BOUNDARY_LIMITS.file : BOUNDARY_LIMITS.body) + 1);
      const [entry] = declaredZipSizes(fixture.bytes); assert.equal(entry.actualBytes, entry.declaredBytes);
      const bodyBytes = await serializedFixtureBodyBytes(fixture);
      const policy = cloudRequestPolicy('POST', '/mods/synthetic', { 'content-length': String(bodyBytes) });
      if (fixture.kind === 'file-size') {
        assert.ok(bodyBytes < BOUNDARY_LIMITS.body);
        assert.equal(policy.status, 200);
        assert.equal(validateBuildArchive(fixture.name, fixture.bytes.length, BOUNDARY_LIMITS.file, true), fixture.expected);
      } else assert.equal(policy.status, 413);
      results.push({ name: fixture.name, sizeBytes: fixture.bytes.length, serializedBodyBytes: bodyBytes, attempts: fixture.attempts, scans: fixture.scans, expected: fixture.expected });
    } else if (fixture.kind === 'pixels') {
      assert.ok(fixture.bytes.length < 128 * 1024);
      const meta = await sharp(fixture.bytes).metadata();
      assert.equal(meta.format, 'png'); assert.equal(meta.width, 2049); assert.equal(meta.height, 2048);
      assert.ok(meta.width * meta.height > BOUNDARY_LIMITS.pixels);
      const before = process.env.CLOUD_PILOT;
      process.env.CLOUD_PILOT = 'on';
      try { await assert.rejects(decodeMediaImage(fixture.bytes), { message: fixture.expected }); }
      finally { if (before === undefined) delete process.env.CLOUD_PILOT; else process.env.CLOUD_PILOT = before; }
      results.push({ name: fixture.name, sizeBytes: fixture.bytes.length, width: meta.width, height: meta.height, attempts: fixture.attempts, scans: fixture.scans, expected: fixture.expected });
    } else {
      assert.ok(fixture.bytes.length < 1024);
      const entries = declaredZipSizes(fixture.bytes);
      assert.equal(entries.reduce((sum, entry) => sum + entry.actualBytes, 0), fixture.kind === 'member-size' ? 1 : 5);
      const declaredBytes = entries.reduce((sum, entry) => sum + entry.declaredBytes, 0);
      assert.equal(declaredBytes, (fixture.kind === 'member-size' ? BOUNDARY_LIMITS.file : BOUNDARY_LIMITS.expanded) + 1);
      assert.deepEqual(await validateCloudArchive(fixture.bytes), { ok: false, reason: 'invalid-archive', message: fixture.expected });
      results.push({ name: fixture.name, sizeBytes: fixture.bytes.length, declaredBytes, actualPayloadBytes: entries.length, attempts: fixture.attempts, scans: fixture.scans, expected: fixture.expected });
    }
  }
  return results;
}

async function main() {
  const options = parseBoundaryArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Offline self-test by default; --write-temp writes the five verified synthetic fixtures to one fresh temp directory. No live mode, input paths, output overrides, credentials, extraction, or network. Declared ZIP sizes are metadata-only and actual payloads total at most five stored bytes. Pixel fixture is a real 2049x2048 PNG. Expected attempt/scan charges assume earlier authentication/permission/rate gates allow the request.');
    return;
  }
  const fixtures = await createBoundaryFixtures();
  const results = await selfTestBoundaryFixtures(fixtures);
  if (options.writeTemp) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'betamods-boundary-fixtures-'));
    for (const [index, fixture] of fixtures.entries()) {
      const destination = path.join(directory, fixture.name);
      await writeFile(destination, fixture.bytes, { flag: 'wx' });
      results[index].path = destination;
    }
  }
  console.log(JSON.stringify({ offlineOnly: true, hostedChecksPerformed: false, fixtures: results,
    chargeNote: 'Size/body reject before reservation. Declared ZIP-limit rejects release bytes but retain an attempt; no scan. Pixel check follows one original scan, so retains one attempt and one scan charge if that scan succeeds. No canonical scan or stored object.' }, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error('Offline boundary fixture self-test failed; no hosted checks performed.');
    process.exitCode = 1;
  });
}
