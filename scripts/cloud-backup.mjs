#!/usr/bin/env node
// A bounded, encrypted GitHub-hosted backup. Never reads a local .env file.
import { spawn } from 'node:child_process';
import { constants, createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import postgres from 'postgres';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { BackupError, LIMITS, PILOT_DATABASE_HOST, PILOT_BUCKET, RESTORE_DATABASE, backupConfig, databaseUrl,
  encryptionKey, reconcileReferences, sha256, copyBounded, hashFile, encryptArchive, decryptArchive } from './cloud-backup-core.mjs';

const fail = code => { throw new BackupError(code); };
// Fixed phase names only: useful failure context without keys, URLs, row data,
// object paths, provider text or subprocess output in GitHub logs.
const progress = stage => console.log(JSON.stringify({ backupStage: stage }));
const sqlOptions = { max: 1, prepare: false, connect_timeout: 15, idle_timeout: 10,
  onnotice() {}, connection: { application_name: 'betamods-backup', statement_timeout: 60000 } };
const rowsLimit = LIMITS.objects + 1;

/** Allowlisted child environment: neither provider nor backup encryption keys enter PG tools. */
export function pgEnvironment(url, readOnly, inherited = process.env) {
  const env = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'HOME', 'TMPDIR', 'TEMP', 'TMP']) if (inherited[name]) env[name] = inherited[name];
  return Object.assign(env, {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: readOnly ? 'require' : 'disable', PGCONNECT_TIMEOUT: '15', PGAPPNAME: 'betamods-backup',
    PGOPTIONS: `-c statement_timeout=240000 -c lock_timeout=15000${readOnly ? ' -c default_transaction_read_only=on' : ''}`,
  });
}

/** Bounded stdout/stderr; errors intentionally never include tool output or argv. */
export async function pgCommand(binary, args, env, { input, output, maxBytes = 64 * 1024, timeoutMs = 300000 } = {}) {
  const child = spawn(binary, args, { env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const chunks = []; let bytes = 0; let stderrBytes = 0; let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs); timer.unref();
  child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 64 * 1024) child.kill('SIGKILL'); });
  const closed = new Promise((resolve, reject) => {
    child.once('error', () => reject(new BackupError('postgres-tool-unavailable')));
    child.once('close', code => code === 0 && !timedOut && stderrBytes === 0 ? resolve() : reject(new BackupError(timedOut ? 'postgres-tool-timeout' : 'postgres-tool-failed')));
  });
  // Attach consumers immediately so rejected subprocesses cannot leave pipes blocked.
  const writing = input ? pipeline(createReadStream(input), child.stdin) : Promise.resolve(child.stdin.end());
  const reading = output ? copyBounded(child.stdout, output, maxBytes) : (async () => {
    for await (const chunk of child.stdout) {
      bytes += chunk.length; if (bytes > maxBytes) { child.kill('SIGKILL'); fail('postgres-output-limit'); } chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  })();
  try { const results = await Promise.all([closed, writing, reading]); return results[2]; }
  catch { child.kill('SIGKILL'); fail('postgres-command-failed'); }
  finally { clearTimeout(timer); }
}

async function version18(binary, env) {
  const version = await pgCommand(binary, ['--version'], env, { maxBytes: 4096, timeoutMs: 15000 });
  if (!/\b18(?:\.\d+)*(?:\s|$|\))/.test(version)) fail('postgres18-client-required');
}

async function databaseState(sql) {
  const [version] = await sql`select current_setting('server_version_num') as version`;
  if (Number(version.version) < 180000 || Number(version.version) >= 190000) fail('postgres18-server-required');
  const tables = await sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name limit 65`;
  if (!tables.length || tables.length > 64) fail('database-table-limit');
  const tableCounts = {}; let rows = 0;
  for (const table of tables) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(table.table_name)) fail('database-table-name');
    const [count] = await sql.unsafe(`select count(*)::text as count from public."${table.table_name}"`);
    const value = Number(count.count); rows += value;
    if (!Number.isSafeInteger(value) || value < 0 || value > 100000 || rows > 200000) fail('database-row-limit');
    tableCounts[table.table_name] = value;
  }
  const columns = await sql`select table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
    from information_schema.columns where table_schema='public' order by table_name,ordinal_position`;
  const constraints = await sql`select c.relname as table_name, con.conname as name, pg_get_constraintdef(con.oid) as definition
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' order by c.relname,con.conname`;
  const indexes = await sql`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`;
  const enums = await sql`select t.typname,e.enumlabel,e.enumsortorder from pg_type t join pg_enum e on e.enumtypid=t.oid
    join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' order by t.typname,e.enumsortorder`;
  if (columns.length > 4096 || constraints.length > 4096 || indexes.length > 4096 || enums.length > 1024) fail('schema-size-limit');
  return { tableCounts, schemaHash: sha256(JSON.stringify({ columns, constraints, indexes, enums })) };
}

async function databaseReferences(sql) {
  const builds = await sql`select id,file_url from public.builds order by id limit ${rowsLimit}`;
  const media = await sql`select id,object_key,size_bytes,scan_state from public.mod_media order by id limit ${rowsLimit}`;
  const attachments = await sql`select id,object_key,size_bytes,scan_state,reservation_id from public.bug_attachments order by id limit ${rowsLimit}`;
  const reservations = await sql`select id,build_id,media_id,bytes,state from public.storage_reservations where state in ('held','stored') order by id limit ${rowsLimit}`;
  const [legacy] = await sql`select count(*)::text as count from public.bug_reports where attachment_url is not null`;
  return { builds, media, attachments, reservations, legacyAttachments: Number(legacy.count) };
}

async function listObjects(client, bucket, deadline) {
  const inventory = []; let token; const seen = new Set(); let total = 0;
  do {
    if (Date.now() >= deadline) fail('backup-deadline');
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }),
      { abortSignal: AbortSignal.timeout(Math.min(30000, deadline - Date.now())) });
    for (const item of page.Contents ?? []) {
      if (inventory.length >= LIMITS.objects) fail('inventory-count-limit');
      inventory.push({ key: item.Key, bytes: item.Size, etag: item.ETag }); total += Number(item.Size);
      if (!Number.isSafeInteger(total) || total > LIMITS.objectTotal) fail('inventory-byte-limit');
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!token || seen.has(token))) fail('inventory-pagination-invalid');
    if (token) seen.add(token);
  } while (token);
  return inventory.sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

async function createBackup({ env, work, output, pgDump }) {
  progress('create-config');
  const config = backupConfig(env); const pgEnv = pgEnvironment(config.database, true);
  progress('create-client-version');
  await version18(pgDump, pgEnv);
  const sql = postgres(config.database.href, { ...sqlOptions, connection: { ...sqlOptions.connection, default_transaction_read_only: 'on', idle_in_transaction_session_timeout: 300000 } });
  const client = new S3Client({ endpoint: config.endpoint, region: config.region, credentials: config.credentials, forcePathStyle: true, maxAttempts: 1 });
  const deadline = Date.now() + 10 * 60 * 1000;
  try {
    const { manifest, files, inventory } = await sql.begin('isolation level repeatable read read only', async tx => {
      progress('create-readonly-snapshot');
      const [identity] = await tx`select current_user as name,current_setting('transaction_read_only') as readonly`;
      if (identity.name !== 'betamods_backup' || identity.readonly !== 'on') fail('readonly-backup-role-required');
      const database = await databaseState(tx);
      const rawReferences = await databaseReferences(tx);
      const inventory = await listObjects(client, config.bucket, deadline);
      const references = reconcileReferences(rawReferences, inventory);
      const [snapshot] = await tx`select pg_export_snapshot() as snapshot`;
      if (!/^[A-Fa-f0-9]+-[A-Fa-f0-9]+-[0-9]+$/.test(snapshot.snapshot ?? '')) fail('database-snapshot-invalid');
      const dumpFile = path.join(work, 'database.dump');
      progress('create-database-dump');
      await pgCommand(pgDump, ['--format=custom', '--compress=0', '--schema=public', '--no-owner', '--no-acl', '--no-tablespaces',
        '--no-security-labels', '--no-publications', '--no-subscriptions', `--snapshot=${snapshot.snapshot}`, '--no-password'], pgEnv,
      { output: dumpFile, maxBytes: LIMITS.dumpBytes });
      const files = [dumpFile]; const entries = [{ name: 'database.dump', ...await hashFile(dumpFile, LIMITS.dumpBytes) }];
      progress('create-private-objects');
      for (let i = 0; i < references.length; i++) {
        if (Date.now() >= deadline) fail('backup-deadline');
        const ref = references[i]; const item = inventory.find(item => item.key === ref.key);
        const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: ref.key, IfMatch: item.etag }),
          { abortSignal: AbortSignal.timeout(Math.min(60000, deadline - Date.now())) });
        if (!object.Body || object.ContentLength !== ref.bytes || object.ETag !== item.etag) { object.Body?.destroy?.(); fail('object-changed'); }
        const file = path.join(work, `object-${String(i).padStart(5, '0')}.bin`);
        const digest = await copyBounded(object.Body, file, LIMITS.objectBytes, ref.bytes);
        files.push(file); entries.push({ name: `objects/${ref.key}`, ...digest });
      }
      // A transaction round trip proves the exported snapshot remained alive.
      await tx`select 1`;
      return { manifest: { version: 1, createdAt: new Date().toISOString(), databaseHost: PILOT_DATABASE_HOST, bucket: PILOT_BUCKET,
        database, references, entries }, files, inventory };
    });
    // Immutable object keys + ETags make concurrent upload/delete drift a failure,
    // not a misleading partial snapshot. Later app writes belong to a later run.
    progress('create-drift-recheck');
    const after = await listObjects(client, config.bucket, deadline);
    if (JSON.stringify(after) !== JSON.stringify(inventory)) fail('storage-changed-during-backup');
    const current = await sql.begin('isolation level repeatable read read only', async tx => reconcileReferences(await databaseReferences(tx), after));
    if (JSON.stringify(current) !== JSON.stringify(manifest.references)) fail('references-changed-during-backup');
    const encrypted = path.join(work, 'snapshot.bmbak');
    progress('create-encrypt');
    const result = await encryptArchive({ manifest, files, key: config.key, output: encrypted });
    await copyFile(encrypted, output, constants.COPYFILE_EXCL); await chmod(output, 0o600);
    return { mode: 'create', objects: manifest.references.length, objectBytes: manifest.references.reduce((n, ref) => n + ref.bytes, 0),
      tables: Object.keys(manifest.database.tableCounts).length, encryptedBytes: result.bytes, encryptedSha256: result.sha256 };
  } finally { client.destroy(); await sql.end({ timeout: 5 }); }
}

async function verifyBackup({ env, work, input, pgRestore }) {
  progress('verify-config');
  const url = databaseUrl(env.BACKUP_RESTORE_DATABASE_URL, true);
  const key = encryptionKey(env.BACKUP_ENCRYPTION_KEY); const pgEnv = pgEnvironment(url, false);
  await version18(pgRestore, pgEnv);
  progress('verify-authenticate-and-hash');
  const { manifest, files } = await decryptArchive({ input, key, directory: work });
  progress('verify-dump-format');
  await pgCommand(pgRestore, ['--list'], pgEnv, { input: files[0], maxBytes: 2 * 1024 * 1024 });
  const sql = postgres(url.href, sqlOptions);
  try {
    progress('verify-empty-local-database');
    const [identity] = await sql`select current_database() as name,current_setting('server_version_num') as version`;
    if (identity.name !== RESTORE_DATABASE || Number(identity.version) < 180000 || Number(identity.version) >= 190000) fail('restore-identity-refused');
    const [existing] = await sql`select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') +
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') +
      (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') as count`;
    if (Number(existing.count) !== 0) fail('restore-database-not-empty');
    // The fixed, verified-empty disposable DB only; never --clean/--create or a
    // production target. pg_dump includes CREATE SCHEMA public in its archive.
    await sql`drop schema if exists public`;
    progress('verify-restore-local-database');
    await pgCommand(pgRestore, ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--no-tablespaces',
      '--no-security-labels', '--no-publications', '--no-subscriptions', `--dbname=${RESTORE_DATABASE}`, '--no-password'], pgEnv, { input: files[0] });
    await sql.begin('isolation level repeatable read read only', async tx => {
      progress('verify-restored-manifest');
      const database = await databaseState(tx);
      if (JSON.stringify(database) !== JSON.stringify(manifest.database)) fail('restored-database-mismatch');
      const inventory = manifest.references.map(ref => ({ key: ref.key, bytes: ref.bytes, etag: 'verified' }));
      const references = reconcileReferences(await databaseReferences(tx), inventory);
      if (JSON.stringify(references) !== JSON.stringify(manifest.references)) fail('restored-references-mismatch');
    });
    return { mode: 'verify', authenticated: true, objects: manifest.references.length, tables: Object.keys(manifest.database.tableCounts).length,
      restored: true, scope: 'Fresh disposable PostgreSQL database and private extracted files; no cloud writes.' };
  } finally { await sql.end({ timeout: 5 }); }
}

export function parseArguments(args) {
  const [mode, ...rest] = args;
  if (!['create', 'verify'].includes(mode)) fail('usage-create-or-verify');
  const result = { mode, pgDump: 'pg_dump', pgRestore: 'pg_restore' }; const seen = new Set();
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i]; const value = rest[i + 1];
    if (!['--output', '--input', '--pg-dump', '--pg-restore'].includes(flag) || !value || value.startsWith('--') || seen.has(flag)) fail('usage-invalid-argument');
    seen.add(flag); result[{ '--output': 'output', '--input': 'input', '--pg-dump': 'pgDump', '--pg-restore': 'pgRestore' }[flag]] = value;
  }
  if (mode === 'create' ? !result.output || result.input : !result.input || result.output) fail('usage-input-output');
  if (result.output) result.output = path.resolve(result.output);
  if (result.input) result.input = path.resolve(result.input);
  return result;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const options = parseArguments(args);
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted') fail('github-hosted-runner-required');
  if (options.output) {
    try { await lstat(options.output); fail('output-already-exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const parent = await mkdtemp(path.join(os.tmpdir(), 'betamods-backup-')); await chmod(parent, 0o700);
  try {
    return options.mode === 'create' ? await createBackup({ ...options, env, work: parent }) : await verifyBackup({ ...options, env, work: parent });
  } finally {
    // Exact directory created by mkdtemp, never a caller-supplied removal target.
    if (path.dirname(parent) !== path.resolve(os.tmpdir()) || !path.basename(parent).startsWith('betamods-backup-')) fail('cleanup-target-refused');
    await rm(parent, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(`Cloud backup refused: ${error instanceof BackupError ? error.message : 'unexpected-failure'}`); process.exitCode = 1;
  });
}
