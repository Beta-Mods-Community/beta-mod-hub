#!/usr/bin/env node
/**
 * Offline exact-boundary rehearsal of the real promotion-package algorithm.
 * No provider/DB credentials, network, public endpoint, or published objects.
 * Synthetic opaque bytes are temp-only algorithm fixtures, not scanned uploads.
 * Run: node scripts/cloud-export-rehearsal.mjs
 * Host execution is a separate approval: only actual Linux cgroup observations
 * there describe host capacity. This is NOT the Next/S3 HTTP integration path.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yauzl from 'yauzl';
import { createMemoryEvidence, memorySnapshot } from './cloud-memory.mjs';

const script = fileURLToPath(import.meta.url);
const MiB = 1024 * 1024;
const inputLimit = 32 * MiB;
const fileLimit = 8 * MiB;
const rootName = 'promotion-export-boundary';
const fixturePaths = [
  `${rootName}/files/build.zip`,
  ...['first', 'second', 'third'].map((name, index) => `${rootName}/media/0${index + 1}-${name}.webp`),
];

export function boundarySourceSizes(entries) {
  assert.equal(entries.length, 10, 'Unexpected generated package layout');
  assert.equal(new Set(entries.map(entry => entry.name)).size, entries.length);
  const names = new Set(entries.map(entry => entry.name));
  for (const name of fixturePaths) assert.ok(names.has(name));
  const accounted = entries.reduce((total, entry) => {
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0);
    return total + entry.bytes + 1024 + 2 * Buffer.byteLength(entry.name, 'utf8');
  }, 0);
  // Calibration uses one byte per source, and real generated metadata/paths.
  for (const name of fixturePaths) assert.equal(entries.find(entry => entry.name === name).bytes, 1);
  const fixedBytes = accounted - fixturePaths.length;
  const last = inputLimit - fixedBytes - 3 * fileLimit;
  assert.ok(last >= 1 && last < fileLimit);
  return { sizes: [fileLimit, fileLimit, fileLimit, last], fixedBytes, accountedBytes: inputLimit };
}

/** @param {string} temp @param {Record<string, string | undefined>} [inherited] @returns {Record<string, string>} */
export function rehearsalEnvironment(temp, inherited = process.env) {
  const env = /** @type {Record<string, string>} */ ({});
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR']) {
    if (inherited[key]) env[key] = inherited[key];
  }
  return Object.assign(env, {
    NODE_ENV: 'production', CLOUD_PILOT: 'on', STORAGE_DRIVER: 's3',
    NEXT_TELEMETRY_DISABLED: '1', TEMP: temp, TMP: temp, TMPDIR: temp,
  });
}

function inspectZip(filename) {
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = []; let total = 0;
      const fail = err => { zip.close(); reject(err); };
      zip.once('error', fail);
      zip.once('end', () => resolve(entries));
      zip.on('entry', entry => {
        if (entries.length >= 16 || entry.uncompressedSize > fileLimit || entry.fileName.endsWith('/')) {
          fail(new Error('Unexpected fixture ZIP entry')); return;
        }
        zip.openReadStream(entry, (readError, stream) => {
          if (readError) { fail(readError); return; }
          const hash = createHash('sha256'); let bytes = 0;
          stream.once('error', fail);
          stream.on('data', chunk => {
            bytes += chunk.length; total += chunk.length;
            if (bytes > fileLimit || total > inputLimit) {
              stream.destroy(); fail(new Error('Fixture ZIP size exceeded')); return;
            }
            hash.update(chunk);
          });
          stream.once('end', () => {
            entries.push({ name: entry.fileName, bytes, sha256: hash.digest('hex') });
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

function fixture(sizes) {
  const expected = new Map();
  const source = index => async () => {
    // Generate each source only when the real algorithm reads it. No shared
    // repeated backing buffers and no giant pre-allocation before measurement.
    const data = randomBytes(sizes[index]);
    expected.set(fixturePaths[index], { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    return { data, size: data.length };
  };
  return {
    expected,
    input: {
      mod: { id: 'synthetic', title: 'Export boundary', game: 'Synthetic', description: 'Offline export rehearsal.' },
      build: { versionLabel: 'test', changelog: 'Synthetic only.', fileUrl: 'builds/build.zip', uploadedAt: new Date(0) },
      requirements: [], readStoredFile: source(0),
      media: ['first', 'second', 'third'].map((name, index) => ({
        filename: `${name}.webp`, caption: null, readStoredFile: source(index + 1),
      })),
    },
  };
}

async function childMain() {
  if (!process.connected) throw new Error('Rehearsal child requires its own parent IPC channel');
  let outboundAttempts = 0;
  net.Socket.prototype.connect = function () {
    outboundAttempts++;
    throw new Error('Network disabled for export rehearsal');
  };
  globalThis.fetch = async () => {
    outboundAttempts++;
    throw new Error('Network disabled for export rehearsal');
  };
  // Imported after network is blocked; storage's directory initialization is
  // confined by this child's fresh scratch cwd, never the user's data folder.
  const { buildPromotionPackage } = await import('../lib/promotion.ts');
  const memory = createMemoryEvidence();
  memory.startup();
  const scratch = process.cwd();
  const assertClean = async () => {
    assert.equal((await readdir(scratch)).filter(name => name.startsWith('betamods-promotion-')).length, 0);
  };
  async function run(name, sizes, rejectExpected = false) {
    const { input, expected } = fixture(sizes);
    const finish = memory.beginExclusive();
    let result;
    try {
      result = await buildPromotionPackage(input);
      if (rejectExpected) {
        assert.equal(result.ok, false);
        assert.match(result.error, /32 MiB/);
        return { name, refused: true };
      }
      assert.ok(result.ok, 'Real export algorithm unexpectedly refused fixture');
      const entries = await inspectZip(result.zipPath);
      for (const [entryName, value] of expected) {
        const entry = entries.find(candidate => candidate.name === entryName);
        assert.equal(entry?.bytes, value.bytes);
        assert.equal(entry?.sha256, value.sha256);
      }
      const accountedBytes = entries.reduce((total, entry) => total + entry.bytes + 1024 + 2 * Buffer.byteLength(entry.name), 0);
      return { name, entries, accountedBytes, zipBytes: result.size };
    } finally {
      if (result?.ok) await result.cleanup();
      await assertClean();
      finish();
    }
  }
  const calibration = await run('calibration', [1, 1, 1, 1]);
  const plan = boundarySourceSizes(calibration.entries);
  const results = [];
  for (let repeat = 1; repeat <= 2; repeat++) {
    const result = await run(`exact-limit-${repeat}`, plan.sizes);
    assert.equal(result.accountedBytes, inputLimit);
    results.push({ name: result.name, accountedBytes: result.accountedBytes, zipBytes: result.zipBytes, entries: result.entries.length, hashesVerified: 4 });
  }
  const over = [...plan.sizes]; over[3]++;
  results.push(await run('one-byte-over', over, true));
  assert.equal(outboundAttempts, 0);
  await assertClean();
  console.log(JSON.stringify({ results, outboundAttempts, scratchClean: true, memory: memorySnapshot(),
    scope: 'Synthetic exact production export algorithm only; no Next HTTP/S3/account/scanner integration and no published files.' }));
}

async function parentMain() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'betamods-export-rehearsal-'));
  // Resolve once and require the generated child directory, never a broad root.
  const resolved = path.resolve(temp);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('betamods-export-rehearsal-')) throw new Error('Unsafe rehearsal scratch');
  try {
    const child = spawn(process.execPath, ['--max-old-space-size=256', '--conditions=react-server', '--import', import.meta.resolve('tsx'), script, '--child'], {
      cwd: resolved, env: rehearsalEnvironment(resolved), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let output = ''; let outputBytes = 0;
    const collect = chunk => {
      outputBytes += chunk.length;
      if (outputBytes > 64 * 1024) child.kill('SIGKILL');
      else output += chunk.toString();
    };
    child.stdout.on('data', collect);
    // Do not echo arbitrary exception text or paths from dependencies.
    let errorBytes = 0; child.stderr.on('data', chunk => { errorBytes += chunk.length; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error(`Export rehearsal failed (exit ${code}, ${errorBytes} stderr bytes withheld)`);
    process.stdout.write(output);
  } finally {
    await rm(resolved, { recursive: true, force: true });
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === script;
if (direct) {
  try {
    if (process.argv.length === 2) await parentMain();
    else if (process.argv.length === 3 && process.argv[2] === '--child') await childMain();
    else throw new Error('Usage: node scripts/cloud-export-rehearsal.mjs');
  } catch {
    console.error('Export rehearsal failed. No production data was used or published.');
    process.exitCode = 1;
  }
}
