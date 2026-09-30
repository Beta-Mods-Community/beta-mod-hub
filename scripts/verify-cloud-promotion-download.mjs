#!/usr/bin/env node
/** Read only the explicit browser-download path and existing fixture manifest. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POSITIVE_LIMITS, POSITIVE_PACKAGE_ROOT as root, accountedEntryBytes, inspectPackage, allowedPositivePackageEntry } from './cloud-positive-export-fixtures.mjs';

export function parsePromotionVerificationArgs(args) {
  if (args.length === 0 || args.length === 1 && args[0] === '--help') return { help: true };
  assert.equal(args.length, 4, 'Exactly one ZIP and one manifest path are required');
  assert.equal(args[0], '--zip'); assert.equal(args[2], '--manifest');
  assert.ok(path.isAbsolute(args[1]) && path.isAbsolute(args[3]), 'Explicit absolute paths are required');
  assert.ok(![args[1], args[3]].some(value => /^[\\/]{2}/.test(value)), 'Network-share paths are not accepted');
  assert.notEqual(path.resolve(args[1]), path.resolve(args[3]));
  return { help: false, zip: path.resolve(args[1]), manifest: path.resolve(args[3]) };
}

export function verifyPromotionEntries(entries, manifest) {
  assert.equal(manifest?.accountedExportBytes, POSITIVE_LIMITS.input);
  assert.equal(manifest?.sources?.length, 5);
  assert.equal(entries.length, 11);
  assert.equal(new Set(entries.map(entry => entry.name)).size, 11);
  assert.ok(entries.every(entry => allowedPositivePackageEntry(entry.name)));
  const byName = new Map(entries.map(entry => [entry.name, entry]));
  const verified = [];
  const imageNames = [];
  const imageIds = new Set();
  for (let index = 0; index < 5; index++) {
    const source = manifest.sources[index];
    assert.equal(source.filename, index === 0 ? 'boundary-build.zip' : `boundary-image-${index}.webp`);
    assert.ok(Number.isSafeInteger(source.storedBytes) && source.storedBytes > 0 && source.storedBytes <= POSITIVE_LIMITS.file);
    assert.match(source.storedSha256, /^[a-f0-9]{64}$/);
    const entry = index === 0 ? byName.get(`${root}/files/boundary-build.zip`) : entries.find(item => item.name.startsWith(`${root}/media/0${index}-`) && item.name.endsWith('.webp'));
    assert.ok(entry, 'Missing expected build or ordered gallery payload');
    assert.equal(entry.bytes, source.storedBytes); assert.equal(entry.sha256, source.storedSha256);
    if (index > 0) {
      const name = entry.name.slice(`${root}/media/`.length); imageNames.push(name); imageIds.add(name.slice(3, -5));
    }
    verified.push({ name: entry.name, bytes: entry.bytes, sha256: entry.sha256 });
  }
  assert.equal(imageIds.size, 4, 'Gallery entries must refer to four distinct server UUIDs');
  for (const name of ['description.bbcode.txt', 'summary.txt', 'readme.txt', 'changelog.txt', 'requirements.txt', 'media/captions.txt']) {
    assert.ok(byName.has(`${root}/${name}`), 'Missing expected text entry');
  }
  // The existing manifest predates the disclosed browser-CRLF/changelog correction.
  // Its five payload hashes remain authoritative; its text metadata does not.
  // Do not rewrite the manifest or infer expected server text to manufacture a pass.
  const captions = `${imageNames.join('\n')}\n`;
  assert.equal(byName.get(`${root}/media/captions.txt`).bytes, Buffer.byteLength(captions));
  assert.equal(byName.get(`${root}/media/captions.txt`).sha256, createHash('sha256').update(captions).digest('hex'));
  const accountedBytes = accountedEntryBytes(entries);
  assert.equal(accountedBytes, POSITIVE_LIMITS.input, 'Downloaded package is not the exact 32 MiB input boundary');
  return { entries: entries.length, accountedBytes, expectedAccountedBytes: POSITIVE_LIMITS.input, payloadHashesVerified: verified.length,
    verified, captionsHashVerified: true, otherTextContentVerified: false,
    otherTextScope: 'Required names, bounded bytes and exact aggregate accounting only; historical manifest text is not compared',
    readOnly: true, oneByteOverHostedAssertion: 'NOT PERFORMED by this verifier' };
}

async function main() {
  const args = parsePromotionVerificationArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Read-only: node --conditions=react-server --import tsx scripts/verify-cloud-promotion-download.mjs --zip ABSOLUTE_PATH_FROM_BROWSER_DOWNLOAD_EVENT --manifest ABSOLUTE_EXISTING_FIXTURE_MANIFEST. No searching, downloads, network, DB, extraction or deletion.');
    return;
  }
  net.Socket.prototype.connect = function () { throw new Error('Verifier network disabled'); };
  globalThis.fetch = async () => { throw new Error('Verifier network disabled'); };
  const deadline = setTimeout(() => { console.error('Read-only promotion verification exceeded its 15 second bound.'); process.exit(1); }, 15000);
  deadline.unref();
  try {
    const info = await stat(args.manifest);
    assert.ok(info.isFile() && info.size > 0 && info.size <= 65536, 'Fixture manifest exceeds bounds');
    const manifest = JSON.parse(await readFile(args.manifest, 'utf8'));
    const entries = await inspectPackage(args.zip);
    console.log(JSON.stringify(verifyPromotionEntries(entries, manifest)));
  } finally { clearTimeout(deadline); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => { console.error('Promotion download verification failed; no files were modified or external services contacted.'); process.exitCode = 1; });
}
