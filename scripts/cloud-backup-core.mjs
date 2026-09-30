import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MiB = 1024 * 1024;
export const LIMITS = Object.freeze({ objects: 2048, objectBytes: 8 * MiB, objectTotal: 100 * MiB, dumpBytes: 40 * MiB, manifestBytes: 2 * MiB, archiveBytes: 150 * MiB });
export const PILOT_DATABASE_HOST = 'ep-fancy-grass-b4eqoloi.c-6.us-east-2.aws.neon.tech';
export const PILOT_STORAGE_HOST = 'yoyusyevjusierybnoaw.storage.supabase.co';
export const PILOT_BUCKET = 'betamods-pilot';
export const RESTORE_DATABASE = 'betamods_restore_rehearsal';
const MAGIC = Buffer.from('BMBAK001');
const HEADER_BYTES = MAGIC.length + 12;
const TAG_BYTES = 16;
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const keyPattern = new RegExp(`^(?:builds/${uuid}/[A-Za-z0-9_.-]{1,120}|media/${uuid}/${uuid}\\.webp|attachments/${uuid}/${uuid}/[A-Za-z0-9_.-]{1,120})$`);
const digestPattern = /^[a-f0-9]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export class BackupError extends Error { constructor(code) { super(code); this.name = 'BackupError'; } }
const fail = code => { throw new BackupError(code); };
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const integer = (value, max, min = 0) => Number.isSafeInteger(value) && value >= min && value <= max;
export const validObjectKey = key => typeof key === 'string' && keyPattern.test(key) && !key.split('/').some(part => part === '.' || part === '..');

export function encryptionKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) fail('encryption-key-invalid');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) fail('encryption-key-invalid');
  return key;
}

export function databaseUrl(value, restore = false) {
  let url;
  try { url = new URL(value); } catch { fail('database-target-invalid'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || url.hash ||
      !['', '5432'].includes(url.port) && !restore) fail('database-target-invalid');
  if (restore) {
    if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || url.pathname !== `/${RESTORE_DATABASE}` ||
        [...url.searchParams.keys()].some(key => key !== 'sslmode') || !['', 'disable'].includes(url.searchParams.get('sslmode') ?? '')) fail('restore-target-refused');
  } else if (url.hostname !== PILOT_DATABASE_HOST || url.username !== 'betamods_backup' || url.pathname !== '/neondb' || url.searchParams.get('sslmode') !== 'require' ||
      [...url.searchParams.keys()].some(key => !['sslmode', 'channel_binding'].includes(key))) fail('pilot-database-required');
  return url;
}

export function backupConfig(env) {
  const database = databaseUrl(env.BACKUP_DATABASE_URL);
  let endpoint;
  try { endpoint = new URL(env.BACKUP_STORAGE_ENDPOINT); } catch { fail('storage-target-invalid'); }
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== PILOT_STORAGE_HOST || endpoint.pathname.replace(/\/$/, '') !== '/storage/v1/s3' ||
      endpoint.username || endpoint.password || endpoint.port || endpoint.search || endpoint.hash || env.BACKUP_STORAGE_BUCKET !== PILOT_BUCKET ||
      !env.BACKUP_STORAGE_REGION || !/^[a-z0-9-]{1,40}$/.test(env.BACKUP_STORAGE_REGION) ||
      !env.BACKUP_STORAGE_ACCESS_KEY || !env.BACKUP_STORAGE_SECRET_KEY) fail('storage-target-invalid');
  return { database, endpoint: endpoint.href, region: env.BACKUP_STORAGE_REGION, bucket: PILOT_BUCKET,
    credentials: { accessKeyId: env.BACKUP_STORAGE_ACCESS_KEY, secretAccessKey: env.BACKUP_STORAGE_SECRET_KEY }, key: encryptionKey(env.BACKUP_ENCRYPTION_KEY) };
}

/** Each clean object must own exactly one settled reservation, and vice versa. */
export function reconcileReferences({ builds, media, attachments, reservations, legacyAttachments = 0 }, inventory) {
  if (![builds, media, attachments, reservations, inventory].every(Array.isArray) || legacyAttachments !== 0 ||
      [builds, media, attachments, reservations, inventory].some(rows => rows.length > LIMITS.objects || rows.some(row => !object(row)))) fail('reference-limit-or-legacy');
  const byReservation = new Map();
  for (const row of reservations) {
    if (!object(row) || row.state !== 'stored' || typeof row.id !== 'string' || byReservation.has(row.id) ||
        !integer(Number(row.bytes), LIMITS.objectBytes, 1)) fail('unsettled-or-invalid-ledger');
    byReservation.set(row.id, row);
  }
  const usedReservations = new Set(); const usedKeys = new Set(); const references = [];
  const add = (row, kind, matches) => {
    if (!object(row) || typeof row.id !== 'string' || matches.length !== 1) fail('reference-ledger-mismatch');
    const reservation = matches[0];
    const key = kind === 'build' ? row.file_url : row.object_key;
    const bytes = Number(reservation.bytes);
    if (!validObjectKey(key) || !key.startsWith(`${kind === 'build' ? 'builds' : kind === 'media' ? 'media' : 'attachments'}/`) ||
        usedKeys.has(key) || usedReservations.has(reservation.id) || kind !== 'build' && (row.scan_state !== 'clean' || Number(row.size_bytes) !== bytes)) fail('reference-not-clean-or-unique');
    usedKeys.add(key); usedReservations.add(reservation.id);
    references.push({ key, bytes, kind, id: row.id, reservationId: reservation.id });
  };
  for (const row of builds) add(row, 'build', reservations.filter(r => r.build_id === row.id && !r.media_id));
  for (const row of media) add(row, 'media', reservations.filter(r => r.media_id === row.id && !r.build_id));
  for (const row of attachments) add(row, 'attachment', reservations.filter(r => r.id === row.reservation_id && !r.build_id && !r.media_id));
  if (usedReservations.size !== reservations.length || references.length > LIMITS.objects) fail('unlinked-ledger');
  const stored = new Map(); let total = 0;
  for (const item of inventory) {
    if (!object(item) || !validObjectKey(item.key) || !integer(item.bytes, LIMITS.objectBytes, 1) || stored.has(item.key) ||
        typeof item.etag !== 'string' || item.etag.length < 2 || item.etag.length > 160) fail('inventory-invalid');
    stored.set(item.key, item); total += item.bytes;
    if (total > LIMITS.objectTotal) fail('object-total-limit');
  }
  if (stored.size !== references.length) fail('storage-drift');
  for (const ref of references) if (stored.get(ref.key)?.bytes !== ref.bytes) fail('storage-drift');
  return references.sort((a, b) => a.key.localeCompare(b.key));
}

export function validateManifest(manifest) {
  if (!object(manifest) || manifest.version !== 1 || manifest.databaseHost !== PILOT_DATABASE_HOST || manifest.bucket !== PILOT_BUCKET ||
      !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(manifest.createdAt ?? '') || !object(manifest.database) ||
      !digestPattern.test(manifest.database.schemaHash ?? '') || !object(manifest.database.tableCounts) ||
      !Array.isArray(manifest.references) || manifest.references.length > LIMITS.objects || !Array.isArray(manifest.entries) ||
      manifest.entries.length !== manifest.references.length + 1 || manifest.entries.length > LIMITS.objects + 1) fail('manifest-invalid');
  const tables = Object.entries(manifest.database.tableCounts);
  if (!tables.length || tables.length > 64 || tables.some(([name, count]) => !/^[a-z][a-z0-9_]{0,62}$/.test(name) || !integer(count, 100000)) ||
      tables.reduce((sum, [, count]) => sum + count, 0) > 200000) fail('table-count-limit');
  const keys = new Set(); let objectBytes = 0; let totalBytes = 0;
  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i];
    if (!object(entry) || !digestPattern.test(entry.sha256 ?? '') ||
        !integer(entry.bytes, i === 0 ? LIMITS.dumpBytes : LIMITS.objectBytes, 1)) fail('entry-invalid');
    if (i === 0) { if (entry.name !== 'database.dump') fail('dump-entry-required'); }
    else {
      const ref = manifest.references[i - 1];
      if (!object(ref) || !validObjectKey(ref.key) || keys.has(ref.key) || !['build', 'media', 'attachment'].includes(ref.kind) ||
          typeof ref.id !== 'string' || typeof ref.reservationId !== 'string' || ref.bytes !== entry.bytes || entry.name !== `objects/${ref.key}`) fail('object-entry-invalid');
      keys.add(ref.key); objectBytes += entry.bytes;
    }
    totalBytes += entry.bytes;
  }
  if (objectBytes > LIMITS.objectTotal || totalBytes > LIMITS.objectTotal + LIMITS.dumpBytes) fail('archive-payload-limit');
  const bytes = Buffer.from(JSON.stringify(manifest));
  if (bytes.length > LIMITS.manifestBytes) fail('manifest-size-limit');
  return bytes;
}

function byteGuard(max, expected) {
  let size = 0; const hash = createHash('sha256');
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > max) { callback(new BackupError('stream-size-limit')); return; }
      hash.update(chunk); callback(null, chunk);
    },
    flush(callback) { callback(expected !== undefined && size !== expected ? new BackupError('stream-size-mismatch') : undefined); },
  });
  return { stream, result: () => ({ bytes: size, sha256: hash.digest('hex') }) };
}

export async function copyBounded(body, destination, max, expected) {
  const guard = byteGuard(max, expected);
  // Open outside the cleanup block: a failed exclusive open must never remove
  // someone else's existing file, including a symlink at the destination.
  const file = await open(destination, 'wx', 0o600);
  try {
    await pipeline(body, guard.stream, file.createWriteStream());
    return guard.result();
  } catch (error) { await rm(destination, { force: true }); throw error; }
  finally { await file.close(); }
}

export async function hashFile(file, max) {
  const info = await lstat(file);
  if (!info.isFile() || !integer(info.size, max, 1)) fail('file-size-or-type');
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    bytes += chunk.length; if (bytes > max) fail('file-size-limit'); hash.update(chunk);
  }
  if (bytes !== info.size) fail('file-changed');
  return { bytes, sha256: hash.digest('hex') };
}

export async function encryptArchive({ manifest, files, key, output }) {
  const metadata = validateManifest(manifest);
  if (!(key instanceof Uint8Array) || key.length !== 32 || files.length !== manifest.entries.length) fail('encryption-input-invalid');
  const header = Buffer.concat([MAGIC, randomBytes(12)]);
  const cipher = createCipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  cipher.setAAD(header);
  async function* plaintext() {
    const length = Buffer.alloc(4); length.writeUInt32BE(metadata.length);
    yield length; yield metadata;
    for (let i = 0; i < files.length; i++) {
      const entry = manifest.entries[i]; const info = await lstat(files[i]);
      if (!info.isFile() || info.size !== entry.bytes) fail('entry-source-invalid');
      const hash = createHash('sha256'); let bytes = 0;
      for await (const chunk of createReadStream(files[i])) {
        bytes += chunk.length; if (bytes > entry.bytes) fail('entry-source-grew'); hash.update(chunk); yield chunk;
      }
      if (bytes !== entry.bytes || hash.digest('hex') !== entry.sha256) fail('entry-source-changed');
    }
  }
  async function* encrypted() {
    yield header;
    for await (const chunk of plaintext()) yield cipher.update(chunk);
    yield cipher.final();
    yield cipher.getAuthTag();
  }
  return copyBounded(Readable.from(encrypted()), output, LIMITS.archiveBytes);
}

/** Authenticate all bytes before interpreting metadata or producing entry files. */
export async function decryptArchive({ input, key, directory }) {
  const info = await lstat(input);
  if (!info.isFile() || !integer(info.size, LIMITS.archiveBytes, HEADER_BYTES + TAG_BYTES + 5)) fail('encrypted-size-invalid');
  const handle = await open(input, 'r'); const header = Buffer.alloc(HEADER_BYTES); const tag = Buffer.alloc(TAG_BYTES);
  try { await handle.read(header, 0, header.length, 0); await handle.read(tag, 0, tag.length, info.size - TAG_BYTES); }
  finally { await handle.close(); }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) fail('archive-version-invalid');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  decipher.setAAD(header); decipher.setAuthTag(tag);
  const plaintext = path.join(directory, 'authenticated.container');
  try {
    async function* authenticated() {
      for await (const chunk of createReadStream(input, { start: HEADER_BYTES, end: info.size - TAG_BYTES - 1 })) yield decipher.update(chunk);
      yield decipher.final();
    }
    await copyBounded(Readable.from(authenticated()), plaintext, LIMITS.archiveBytes);
  } catch { fail('archive-authentication-failed'); }
  const decoded = await open(plaintext, 'r'); let manifest; let position = 4;
  try {
    const prefix = Buffer.alloc(4); if ((await decoded.read(prefix, 0, 4, 0)).bytesRead !== 4) fail('manifest-truncated');
    const length = prefix.readUInt32BE(); if (!integer(length, LIMITS.manifestBytes, 2)) fail('manifest-size-invalid');
    const bytes = Buffer.alloc(length);
    if ((await decoded.read(bytes, 0, length, position)).bytesRead !== length) fail('manifest-truncated');
    try { manifest = JSON.parse(bytes.toString('utf8')); } catch { fail('manifest-json-invalid'); }
    validateManifest(manifest); position += length;
  } finally { await decoded.close(); }
  const expectedSize = position + manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if ((await lstat(plaintext)).size !== expectedSize) fail('payload-size-mismatch');
  const files = [];
  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i]; const file = path.join(directory, `entry-${String(i).padStart(5, '0')}.bin`);
    const result = await copyBounded(createReadStream(plaintext, { start: position, end: position + entry.bytes - 1 }), file, entry.bytes, entry.bytes);
    if (result.sha256 !== entry.sha256) fail('entry-hash-mismatch');
    files.push(file); position += entry.bytes;
  }
  return { manifest, files };
}
