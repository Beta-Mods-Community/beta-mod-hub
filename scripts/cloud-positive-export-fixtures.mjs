#!/usr/bin/env node
/**
 * Offline deterministic fixtures for five NORMAL, separately scanned uploads.
 * Generates no malware marker, personal asset, cloud request, or scan verdict.
 * Default self-tests only. --write-temp retains verified originals and a manifest.
 * Run: node scripts/cloud-positive-export-fixtures.mjs [--write-temp]
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import yauzl from 'yauzl';
import { rehearsalEnvironment } from './cloud-export-rehearsal.mjs';

const script = fileURLToPath(import.meta.url);
const MiB = 1024 * 1024;
export const POSITIVE_LIMITS = Object.freeze({ file: 8 * MiB, input: 32 * MiB, pixels: 4 * MiB });
export const LISTING = Object.freeze({
  title: 'Cloud export boundary fixture', game: 'Synthetic QA', tags: 'qa', status: 'alpha',
  description: 'Synthetic upload and export capacity test. Not a playable mod.',
  versionLabel: 'boundary-1', changelog: 'Synthetic capacity fixture.',
});
const buildName = 'boundary-build.zip';
const root = 'promotion-cloud-export-boundary-fixture';
const mediaNames = [1, 2, 3, 4].map(index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}.webp`);
const hash = data => createHash('sha256').update(data).digest('hex');

export function parsePositiveArgs(args) {
  if (args.length === 0) return { help: false, writeTemp: false };
  if (args.length === 1 && args[0] === '--write-temp') return { help: false, writeTemp: true };
  if (args.length === 1 && args[0] === '--help') return { help: true, writeTemp: false };
  throw new Error('Only --help, --write-temp, or no arguments are supported');
}

/** Stable arbitrary RGBA pixels. Alpha varies from128 to255, never invisible. */
export function syntheticPixels(width, height, seed) {
  assert.ok(Number.isInteger(width) && width >= 160 && width <= 2048);
  assert.ok(Number.isInteger(height) && height >= 160 && height <= 2048);
  assert.ok(Number.isInteger(seed) && seed > 0 && seed <= 0xffffffff);
  const data = Buffer.alloc(width * height * 4); let state = seed;
  for (let index = 0; index < data.length; index++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    data[index] = index % 4 === 3 ? 128 + (state & 127) : state & 255;
  }
  return data;
}

export function accountedEntryBytes(entries) {
  assert.ok(entries.length > 0 && entries.length <= 11);
  assert.equal(new Set(entries.map(entry => entry.name)).size, entries.length);
  return entries.reduce((total, entry) => {
    assert.ok(typeof entry.name === 'string' && entry.name.startsWith(`${root}/`) && !entry.name.includes('..'));
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && entry.bytes <= POSITIVE_LIMITS.file);
    return total + entry.bytes + 1024 + 2 * Buffer.byteLength(entry.name);
  }, 0);
}

/** Normal form fields only: description contributes twice; changelog once. */
export function tuneMetadata(accountedBaseBytes) {
  assert.ok(Number.isSafeInteger(accountedBaseBytes));
  const remaining = POSITIVE_LIMITS.input - accountedBaseBytes;
  assert.ok(remaining >= 4 && remaining <= 16000, 'Image calibration must leave a small form-valid text margin');
  const padding = Math.floor(remaining / 2) - 1;
  const description = `${LISTING.description}\n${'x'.repeat(padding)}`;
  const changelog = LISTING.changelog + (remaining % 2 ? 'x' : '');
  assert.ok(description.length <= 10000 && changelog.length <= 5000);
  assert.equal(2 * (description.length - LISTING.description.length) + changelog.length - LISTING.changelog.length, remaining);
  return { description, changelog, addedAccountedBytes: remaining };
}

/** Browser form serialization uses CRLF. BBCode normalizes it, readme does not. */
export function browserFormMetadata(metadata) {
  assert.equal((metadata.description.match(/\n/g) ?? []).length, 1);
  const description = metadata.description.replace(/\r?\n/g, '\r\n');
  const extraReadmeBytes = Buffer.byteLength(description) - Buffer.byteLength(metadata.description);
  assert.ok(extraReadmeBytes === 0 || extraReadmeBytes === 1);
  // Remove one ordinary ASCII changelog character, never mutate cloud data.
  const changelog = extraReadmeBytes ? metadata.changelog.slice(0, -extraReadmeBytes) : metadata.changelog;
  assert.ok(changelog.length > 0 && changelog.trim() === changelog);
  return { ...metadata, description, changelog };
}

/** Uses production's budget function, including its1024-byte scan envelope. */
export function totalScanChargeMiB(sources, scanBudgetCharge) {
  return sources.reduce((sum, source) => sum + scanBudgetCharge(source.originalBytes) + (source.scans === 2 ? scanBudgetCharge(source.storedBytes) : 0), 0);
}

function storedTextZip(crc32) {
  const name = Buffer.from('synthetic-readme.txt');
  const bytes = Buffer.alloc(POSITIVE_LIMITS.file - 98 - 2 * name.length);
  bytes.fill('Synthetic capacity fixture. Not a playable mod.\n');
  const checksum = crc32(bytes);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(checksum, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(checksum, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}

async function inspectPackage(filename) {
  const data = await readFile(filename);
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = []; let total = 0;
      const fail = err => { zip.close(); reject(err); };
      zip.once('error', fail); zip.once('end', () => resolve(entries));
      zip.on('entry', entry => {
        if (entries.length >= 11 || entry.uncompressedSize > POSITIVE_LIMITS.file || entry.fileName.endsWith('/')) return fail(new Error('Unexpected fixture package entry'));
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail(streamError);
          const digest = createHash('sha256'); let bytes = 0;
          stream.once('error', fail);
          stream.on('data', chunk => {
            bytes += chunk.length; total += chunk.length;
            if (bytes > POSITIVE_LIMITS.file || total > POSITIVE_LIMITS.input) { stream.destroy(); fail(new Error('Fixture package exceeded bounds')); return; }
            digest.update(chunk);
          });
          stream.once('end', () => { entries.push({ name: entry.fileName, bytes, sha256: digest.digest('hex') }); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}

async function childMain(writeTemp) {
  assert.ok(process.connected, 'Only the isolated parent can run this child');
  let outboundAttempts = 0;
  net.Socket.prototype.connect = function () { outboundAttempts++; throw new Error('Offline fixture network disabled'); };
  globalThis.fetch = async () => { outboundAttempts++; throw new Error('Offline fixture network disabled'); };
  const [{ decodeMediaImage }, { validateCloudArchive }, { crc32 }, { buildPromotionPackage }, { BetaModFormSchema, BuildUploadFormSchema }, { scanBudgetCharge }] = await Promise.all([
    import('../lib/image-decode.ts'), import('../lib/cloud-archive.ts'), import('../lib/cloud-zip.ts'), import('../lib/promotion.ts'), import('../lib/definitions.ts'), import('../lib/cloud-scan-budget.ts'),
  ]);
  const build = storedTextZip(crc32);
  assert.equal(build.length, POSITIVE_LIMITS.file);
  const archivePolicy = await validateCloudArchive(build);
  assert.ok(archivePolicy.ok, 'Synthetic text ZIP must pass the real bounded archive policy');
  assert.equal(archivePolicy.entries, 1);
  const images = [];
  async function makeImage(index, width) {
    const height = 2048;
    const original = await sharp(syntheticPixels(width, height, 9182 + index), { raw: { width, height, channels: 4 } }).webp({ quality: 90 }).toBuffer();
    assert.ok(original.length <= POSITIVE_LIMITS.file);
    const decoded = await decodeMediaImage(original);
    assert.equal(decoded.width, width); assert.equal(decoded.height, height);
    assert.ok(decoded.data.length <= POSITIVE_LIMITS.file && width * height <= POSITIVE_LIMITS.pixels);
    return { filename: `boundary-image-${index + 1}.webp`, width, height, original, canonical: decoded.data };
  }
  function inputFor(description, changelog, calibration = false) {
    const source = bytes => async () => ({ data: calibration ? Buffer.from('x') : bytes, size: calibration ? 1 : bytes.length });
    return {
      mod: { id: 'synthetic', title: LISTING.title, game: LISTING.game, description },
      build: { versionLabel: LISTING.versionLabel, changelog, fileUrl: `builds/00000000-0000-4000-8000-000000000001/${buildName}`, uploadedAt: new Date('2026-09-30T00:00:00Z') },
      requirements: [], readStoredFile: source(build),
      media: mediaNames.map((filename, index) => ({ filename, caption: null, readStoredFile: source(images[index]?.canonical ?? Buffer.from('x')) })),
    };
  }
  async function packageEntries(input) {
    const result = await buildPromotionPackage(input);
    assert.ok(result.ok, 'Real promotion algorithm must accept synthetic fixture inputs');
    try { return { entries: await inspectPackage(result.zipPath), zipBytes: result.size }; }
    finally { await result.cleanup(); }
  }
  const calibration = await packageEntries(inputFor(LISTING.description, LISTING.changelog, true));
  assert.equal(calibration.entries.length, 11);
  const fixedBytes = accountedEntryBytes(calibration.entries) - 5;
  for (let index = 0; index < 3; index++) images.push(await makeImage(index, 2048));
  const prior = fixedBytes + build.length + images.reduce((sum, image) => sum + image.canonical.length, 0);
  const target = POSITIVE_LIMITS.input - prior - 8000;
  let width = Math.floor(2048 * target / images[0].canonical.length);
  let low = 160; let high = 2048; let fourth;
  for (let attempt = 0; attempt < 12; attempt++) {
    assert.ok(width >= low && width <= high);
    const candidate = await makeImage(3, width);
    const margin = POSITIVE_LIMITS.input - prior - candidate.canonical.length;
    if (margin >= 4 && margin <= 16000) { fourth = candidate; break; }
    if (margin < 4) high = width - 1; else low = width + 1;
    assert.ok(low <= high, 'No form-bounded image calibration available');
    width = Math.floor((low + high) / 2);
  }
  assert.ok(fourth, 'Image calibration did not converge within its fixed effort limit');
  images.push(fourth);
  const storedBytes = build.length + images.reduce((sum, image) => sum + image.canonical.length, 0);
  const metadata = browserFormMetadata(tuneMetadata(fixedBytes + storedBytes));
  const form = { ...LISTING, description: metadata.description };
  assert.ok(BetaModFormSchema.safeParse(form).success);
  assert.ok(BuildUploadFormSchema.safeParse({ versionLabel: LISTING.versionLabel, changelog: metadata.changelog }).success);
  const final = await packageEntries(inputFor(metadata.description, metadata.changelog));
  assert.equal(accountedEntryBytes(final.entries), POSITIVE_LIMITS.input);
  assert.equal(final.entries.find(entry => entry.name === `${root}/files/${buildName}`)?.sha256, hash(build));
  for (const [index, image] of images.entries()) {
    assert.equal(final.entries.find(entry => entry.name === `${root}/media/0${index + 1}-${mediaNames[index]}`)?.sha256, hash(image.canonical));
  }
  const tooLarge = await buildPromotionPackage(inputFor(metadata.description, metadata.changelog + 'x'));
  assert.equal(tooLarge.ok, false); assert.match(tooLarge.error, /32 MiB/);
  const sources = [{ filename: buildName, originalBytes: build.length, storedBytes: build.length, originalSha256: hash(build), storedSha256: hash(build), scans: 1 },
    ...images.map(image => ({ filename: image.filename, width: image.width, height: image.height, pixels: image.width * image.height,
      originalBytes: image.original.length, storedBytes: image.canonical.length, originalSha256: hash(image.original), storedSha256: hash(image.canonical), scans: 2 }))];
  const estimatedScanChargeBytes = MiB * totalScanChargeMiB(sources, scanBudgetCharge);
  assert.equal(outboundAttempts, 0);
  const manifest = {
    offlineOnly: true, malwareScanVerdict: 'NOT PERFORMED; normal hosted scanner must approve each original and canonical image',
    hostedChecksPerformed: false, uploads: 5, scansIfSuccessful: 9, estimatedScanChargeBytes, storedBytes,
    originalBytes: sources.reduce((sum, source) => sum + source.originalBytes, 0), accountedExportBytes: POSITIVE_LIMITS.input,
    packageBytes: final.zipBytes, sourceIntegrityHashesVerified: 5, oneByteOverRejected: true, outboundAttempts,
    listing: form, build: { versionLabel: LISTING.versionLabel, changelog: metadata.changelog },
    instructions: 'Create ONE fresh listing with exactly these fields; upload the build once and these four images in numbered order, empty captions, no requirements or extra images. Description includes normal browser CRLF; build changelog deliberately omits its final period to offset the additional readme byte. Every upload uses the normal scanner/quota path. Server UUIDs differ but their fixed-length names preserve the budget. Verify hosted canonical bytes/hashes before claiming the exact boundary; Sharp platform differences or edited text can change it. Never duplicate DB references or bypass scanning.',
    sources, packageEntries: final.entries,
  };
  if (writeTemp) {
    const directory = path.join(process.cwd(), 'fixtures'); await mkdir(directory);
    await writeFile(path.join(directory, buildName), build, { flag: 'wx' });
    for (const image of images) await writeFile(path.join(directory, image.filename), image.original, { flag: 'wx' });
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
    manifest.outputDirectory = directory;
  }
  console.log(JSON.stringify(manifest));
}

async function parentMain(writeTemp) {
  const scratch = path.resolve(await mkdtemp(path.join(os.tmpdir(), 'betamods-positive-export-')));
  assert.equal(path.dirname(scratch), path.resolve(os.tmpdir()));
  assert.ok(path.basename(scratch).startsWith('betamods-positive-export-'));
  let complete = false;
  try {
    const child = spawn(process.execPath, ['--max-old-space-size=256', '--conditions=react-server', '--import', import.meta.resolve('tsx'), script, '--child', ...(writeTemp ? ['--write-temp'] : [])], {
      cwd: scratch, env: rehearsalEnvironment(scratch), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let output = ''; let outputBytes = 0; let errorBytes = 0;
    child.stdout.on('data', chunk => { outputBytes += chunk.length; if (outputBytes > 64 * 1024) child.kill('SIGKILL'); else output += chunk.toString(); });
    child.stderr.on('data', chunk => { errorBytes += chunk.length; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error(`Offline fixture self-test failed (${errorBytes} diagnostic bytes withheld)`);
    const report = JSON.parse(output);
    assert.equal(report.accountedExportBytes, POSITIVE_LIMITS.input); assert.equal(report.hostedChecksPerformed, false);
    assert.equal(report.sources.length, 5); assert.equal(report.outboundAttempts, 0);
    complete = true; process.stdout.write(output);
  } finally { if (!writeTemp || !complete) await rm(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  try {
    if (process.argv[2] === '--child') {
      assert.ok(process.argv.length === 3 || process.argv.length === 4 && process.argv[3] === '--write-temp');
      await childMain(process.argv[3] === '--write-temp');
    } else {
      const options = parsePositiveArgs(process.argv.slice(2));
      if (options.help) console.log('Offline synthetic positive export fixture self-test. --write-temp saves five verified originals plus exact normal-form fields in a fresh temp directory. No input paths, live mode, credentials, network, scanner verdict, or app changes.');
      else await parentMain(options.writeTemp);
    }
  } catch (error) {
    if (process.connected) console.error(error);
    else console.error('Offline positive fixture self-test failed. No hosted test or malware scan was performed.');
    process.exitCode = 1;
  }
}
