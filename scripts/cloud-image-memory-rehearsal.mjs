#!/usr/bin/env node
/**
 * Offline allocator comparison, not a hosted upload/scanner/launch proof.
 * Generate fixed originals outside measurement, then exercise the CURRENT
 * production decoder six times with 128 MiB synthetic resident app overhead.
 * Both allocator variants use the same decoder, including its cleanup fix.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryEvidence, memorySnapshot } from './cloud-memory.mjs';

export const IMAGE_MEMORY_LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, pixels: 4194304, fixtures: 3, repeats: 6,
  memory: 512 * 1024 * 1024, appHeadroomBytes: 128 * 1024 * 1024, milliseconds: 120000 });
// Exact originals used in the hosted OOM rehearsal; no smaller substitute.
export const IMAGE_MEMORY_INPUT_HASHES = Object.freeze([
  '97665bc4ec2836b6e19c76e8d59ab25d24850d4b21b959e0c147fad66894ba83',
  '1da4a6f3f45b641c610f5ef7620293f5084b9f07f698415161b6975546bcb841',
  '53865a259fc8c4853e9f192b7449003e326b989f9cf93e9e1be17a732d210eea',
]);
const hash = data => createHash('sha256').update(data).digest('hex');
const filename = index => `boundary-image-${index + 1}.webp`;

export function parseImageMemoryArgs(args) {
  if (args.length === 0 || args.length === 1 && args[0] === '--help') return { mode: 'help' };
  if (args.length !== 2 || !['--prepare', '--measure'].includes(args[0]) || !path.isAbsolute(args[1])) {
    throw new Error('Use --prepare ABSOLUTE_NEW_DIRECTORY or --measure ABSOLUTE_FIXTURE_DIRECTORY');
  }
  return { mode: args[0].slice(2), directory: path.resolve(args[1]) };
}

export function assertImageMemoryEnvironment(env) {
  assert.equal(env.CLOUD_PILOT, 'on', 'Explicit cloud decoder limits are required');
  for (const name of Object.keys(env)) {
    assert.ok(!/^(?:DATABASE_URL|SESSION_SECRET|ENCRYPTION_KEY|PILOT_ACCESS_KEY|RESEND_API_KEY|TRANSLOADIT_.+|STORAGE_(?:ACCESS_KEY|SECRET_KEY)|BACKUP_.+|GITHUB_TOKEN|ACTIONS_RUNTIME_TOKEN)$/.test(name), 'Provider credentials must not enter the rehearsal');
  }
  assert.ok(env.MALLOC_ARENA_MAX === undefined || env.MALLOC_ARENA_MAX === '2', 'Only default allocator or arena2 is compared');
}

export function validateImageMemoryManifest(manifest) {
  assert.equal(manifest?.version, 1);
  assert.equal(manifest?.fixtures?.length, IMAGE_MEMORY_LIMITS.fixtures);
  for (const [index, item] of manifest.fixtures.entries()) {
    assert.equal(item.filename, filename(index));
    assert.equal(item.sha256, IMAGE_MEMORY_INPUT_HASHES[index]);
    assert.equal(item.width, 2048); assert.equal(item.height, 2048);
    for (const bytes of [item.bytes, item.canonicalBytes]) assert.ok(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= IMAGE_MEMORY_LIMITS.bytes);
    assert.match(item.canonicalSha256, /^[a-f0-9]{64}$/);
  }
  return manifest;
}

function blockNetwork() {
  let attempts = 0;
  net.Socket.prototype.connect = function () { attempts++; throw new Error('Offline allocator rehearsal: network disabled'); };
  globalThis.fetch = async () => { attempts++; throw new Error('Offline allocator rehearsal: network disabled'); };
  return () => attempts;
}

async function prepare(directory) {
  // Refuse an existing target. This script never removes files/directories.
  await mkdir(directory);
  const [{ default: sharp }, { syntheticPixels }, { decodeMediaImage }] = await Promise.all([
    import('sharp'), import('./cloud-positive-export-fixtures.mjs'), import('../lib/image-decode.ts'),
  ]);
  sharp.concurrency(1); sharp.cache(false);
  const fixtures = [];
  for (let index = 0; index < IMAGE_MEMORY_LIMITS.fixtures; index++) {
    const original = await sharp(syntheticPixels(2048, 2048, 9182 + index), { raw: { width: 2048, height: 2048, channels: 4 } })
      .webp({ quality: 90 }).toBuffer();
    assert.equal(hash(original), IMAGE_MEMORY_INPUT_HASHES[index], 'Generated input differs from the hosted boundary fixture');
    const canonical = await decodeMediaImage(original);
    const item = { filename: filename(index), bytes: original.length, sha256: hash(original), width: canonical.width, height: canonical.height,
      canonicalBytes: canonical.data.length, canonicalSha256: hash(canonical.data) };
    fixtures.push(item);
    await writeFile(path.join(directory, item.filename), original, { flag: 'wx' });
  }
  const manifest = validateImageMemoryManifest({ version: 1, fixtures, generatedWith: { node: process.version, sharp: sharp.versions } });
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx' });
  console.log(JSON.stringify({ event: 'prepared', manifest }));
}

async function measure(directory) {
  assert.equal(process.platform, 'linux', 'Windows measurements do not establish Linux allocator behavior');
  assert.equal(memorySnapshot().cgroup.maxBytes, IMAGE_MEMORY_LIMITS.memory, 'The real 512 MiB cgroup limit must already be active');
  const manifestPath = path.join(directory, 'manifest.json');
  assert.ok((await stat(manifestPath)).size <= 8192);
  const manifest = validateImageMemoryManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  const [{ default: sharp }, { decodeMediaImage }] = await Promise.all([import('sharp'), import('../lib/image-decode.ts')]);
  sharp.concurrency(1); sharp.cache(false);
  const evidence = createMemoryEvidence();
  const allocator = process.env.MALLOC_ARENA_MAX === '2' ? 'arena2' : 'default';
  const withoutSyntheticOverhead = memorySnapshot();
  // Explicit, touched and retained in BOTH variants. This is an approximation
  // of app residency, not an actual Next server or permission to skip its test.
  const appOverhead = Buffer.alloc(IMAGE_MEMORY_LIMITS.appHeadroomBytes, 1);
  console.log(JSON.stringify({ event: 'configuration', allocator, node: process.version, sharp: sharp.versions,
    glibc: process.report.getReport().header.glibcVersionRuntime, withoutSyntheticOverhead,
    scope: 'current production decoder plus 128 MiB synthetic resident overhead; no Next, scanner, DB, or storage', limits: IMAGE_MEMORY_LIMITS }));
  evidence.startup();
  const results = [];
  async function iteration(index) {
    const item = manifest.fixtures[index % IMAGE_MEMORY_LIMITS.fixtures];
    console.log(JSON.stringify({ event: 'iteration-start', iteration: index + 1, input: item.filename }));
    const finish = evidence.beginExclusive();
    try {
      const inputPath = path.join(directory, item.filename);
      assert.equal((await stat(inputPath)).size, item.bytes);
      const source = await readFile(inputPath);
      assert.equal(hash(source), item.sha256);
      const output = await decodeMediaImage(source);
      assert.equal(output.width, item.width); assert.equal(output.height, item.height);
      assert.equal(output.data.length, item.canonicalBytes);
      assert.equal(hash(output.data), item.canonicalSha256);
      return { iteration: index + 1, inputSha256: item.sha256, outputSha256: item.canonicalSha256, outputBytes: output.data.length };
    } finally { finish(); }
    // Buffers leave scope before the next iteration. No forced GC, sleeps,
    // resizing, changed encoding effort, or retained output buffers.
  }
  for (let index = 0; index < IMAGE_MEMORY_LIMITS.repeats; index++) {
    results.push(await iteration(index));
    assert.equal(appOverhead[index * 4096], 1);
  }
  assert.equal(appOverhead.at(-1), 1);
  console.log(JSON.stringify({ event: 'complete', allocator, results, memory: memorySnapshot() }));
}

async function main() {
  const args = parseImageMemoryArgs(process.argv.slice(2));
  if (args.mode === 'help') {
    console.log('Offline only: --prepare ABSOLUTE_NEW_DIRECTORY generates the three hosted 4 MP originals; --measure ABSOLUTE_FIXTURE_DIRECTORY runs 6 decodes inside an existing networkless 512 MiB Linux container with 128 MiB synthetic app overhead. No credentials, provider calls, scan verdicts or hosted-readiness claim.');
    return;
  }
  assertImageMemoryEnvironment(process.env);
  const attempts = blockNetwork();
  const deadline = setTimeout(() => { console.error('Offline allocator rehearsal exceeded its 120 second bound.'); process.exit(1); }, IMAGE_MEMORY_LIMITS.milliseconds);
  deadline.unref();
  try {
    if (args.mode === 'prepare') await prepare(args.directory);
    else await measure(args.directory);
    assert.equal(attempts(), 0);
    console.log(JSON.stringify({ event: 'offline-verified', outboundAttempts: attempts() }));
  } finally { clearTimeout(deadline); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(error => {
    console.error('Offline image-memory rehearsal failed:', error instanceof Error ? error.message : 'Unknown error'); process.exitCode = 1;
  });
}
