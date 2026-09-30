import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { LIMITS, PILOT_DATABASE_HOST, PILOT_STORAGE_HOST, PILOT_BUCKET, RESTORE_DATABASE, encryptionKey, databaseUrl, backupConfig,
  reconcileReferences, validateManifest, sha256, copyBounded, encryptArchive, decryptArchive } from "../scripts/cloud-backup-core.mjs";
import { parseArguments, pgEnvironment, pgCommand, main } from "../scripts/cloud-backup.mjs";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reservationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const objectKey = `builds/${id}/synthetic.zip`;
const payload = Buffer.from("Synthetic clean fixture, not a real mod.");
const dump = Buffer.from("PGDMP:synthetic test only");
const key = randomBytes(32);
const config = {
  BACKUP_DATABASE_URL: `postgresql://betamods_backup:unused@${PILOT_DATABASE_HOST}/neondb?sslmode=require`,
  BACKUP_STORAGE_ENDPOINT: `https://${PILOT_STORAGE_HOST}/storage/v1/s3`, BACKUP_STORAGE_BUCKET: PILOT_BUCKET,
  BACKUP_STORAGE_REGION: "us-east-1", BACKUP_STORAGE_ACCESS_KEY: "synthetic", BACKUP_STORAGE_SECRET_KEY: "synthetic-secret",
  BACKUP_ENCRYPTION_KEY: key.toString("base64"),
};
const rows = () => ({ builds: [{ id, file_url: objectKey }], media: [], attachments: [],
  reservations: [{ id: reservationId, build_id: id, media_id: null, state: "stored", bytes: String(payload.length) }], legacyAttachments: 0 });
const inventory = () => [{ key: objectKey, bytes: payload.length, etag: '"synthetic-etag"' }];
const manifest = () => ({ version: 1, createdAt: "2026-09-29T00:00:00.000Z", databaseHost: PILOT_DATABASE_HOST, bucket: PILOT_BUCKET,
  database: { tableCounts: { builds: 1, storage_reservations: 1, users: 1 }, schemaHash: sha256("synthetic schema") },
  references: reconcileReferences(rows(), inventory()), entries: [
    { name: "database.dump", bytes: dump.length, sha256: sha256(dump) },
    { name: `objects/${objectKey}`, bytes: payload.length, sha256: sha256(payload) },
  ] });

async function temporary(fn: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "betamods-backup-unit-"));
  try { await fn(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

async function fixture(directory: string) {
  const files = [path.join(directory, "dump.bin"), path.join(directory, "object.bin")];
  await writeFile(files[0], dump); await writeFile(files[1], payload);
  const output = path.join(directory, "snapshot.bmbak");
  const result = await encryptArchive({ manifest: manifest(), files, key, output });
  return { output, result, files };
}

// Build intentionally malformed, but correctly authenticated test containers to
// distinguish cryptographic integrity checks from structural/hash validation.
async function forged(file: string, value: unknown, suffix: Buffer = Buffer.concat([dump, payload])) {
  const json = Buffer.from(JSON.stringify(value)); const length = Buffer.alloc(4); length.writeUInt32BE(json.length);
  const header = Buffer.concat([Buffer.from("BMBAK001"), randomBytes(12)]);
  const cipher = createCipheriv("aes-256-gcm", key, header.subarray(8)); cipher.setAAD(header);
  await writeFile(file, Buffer.concat([header, cipher.update(Buffer.concat([length, json, suffix])), cipher.final(), cipher.getAuthTag()]));
}

test("backup targets and encryption key are fixed, private and fail closed", () => {
  const validated = backupConfig(config); assert.ok(validated.database);
  assert.equal(validated.database.hostname, PILOT_DATABASE_HOST);
  assert.deepEqual(encryptionKey(config.BACKUP_ENCRYPTION_KEY), key);
  for (const value of ["", "x".repeat(32), randomBytes(16).toString("base64"), key.toString("base64") + "\n"]) assert.throws(() => encryptionKey(value));
  for (const url of [config.BACKUP_DATABASE_URL.replace("betamods_backup", "neondb_owner"), config.BACKUP_DATABASE_URL.replace("ep-fancy-grass", "ep-other"), config.BACKUP_DATABASE_URL.replace(".c-6", "-pooler.c-6"),
    config.BACKUP_DATABASE_URL.replace("require", "disable"), config.BACKUP_DATABASE_URL + "&options=anything"]) assert.throws(() => databaseUrl(url));
  for (const changes of [{ BACKUP_STORAGE_BUCKET: "other" }, { BACKUP_STORAGE_ENDPOINT: config.BACKUP_STORAGE_ENDPOINT + "?redirect=evil" },
    { BACKUP_STORAGE_ACCESS_KEY: "" }, { BACKUP_STORAGE_SECRET_KEY: "" }, { BACKUP_STORAGE_REGION: "" }]) assert.throws(() => backupConfig({ ...config, ...changes }));
});

test("restore only permits a loopback disposable database, never a deployed branch", () => {
  const url = databaseUrl(`postgresql://user:secret@127.0.0.1:54329/${RESTORE_DATABASE}?sslmode=disable`, true); assert.ok(url);
  assert.equal(url.hostname, "127.0.0.1");
  for (const url of [config.BACKUP_DATABASE_URL, `postgresql://user:secret@evil.example/${RESTORE_DATABASE}`,
    "postgresql://user:secret@localhost/neondb", `postgresql://user:secret@localhost/${RESTORE_DATABASE}?options=unsafe`]) assert.throws(() => databaseUrl(url, true));
});

test("PG tools receive only explicit connection variables, not cloud keys or caller PG overrides", () => {
  const env = pgEnvironment(databaseUrl(config.BACKUP_DATABASE_URL), true, { NODE_ENV: "test", PATH: "synthetic-path", BACKUP_ENCRYPTION_KEY: "private", PGHOST: "evil", NODE_OPTIONS: "unsafe" });
  assert.equal(env.PGHOST, PILOT_DATABASE_HOST); assert.equal(env.PGSSLMODE, "require");
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  for (const name of ["BACKUP_ENCRYPTION_KEY", "NODE_OPTIONS", "BACKUP_STORAGE_SECRET_KEY"]) assert.equal(Object.hasOwn(env, name), false);
});

test("CLI validates flags and refuses operation outside GitHub-hosted runners before touching files", async () => {
  assert.equal(parseArguments(["create", "--output", "snapshot.bmbak"]).mode, "create");
  for (const args of [[], ["restore"], ["create", "--input", "x"], ["verify", "--input", "x", "--input", "y"], ["create", "--output", "x", "--secret", "y"]]) assert.throws(() => parseArguments(args));
  await assert.rejects(main(["create", "--output", "never-created.bmbak"], { NODE_ENV: "test" }), /github-hosted-runner-required/);
});

test("ledger reconciliation requires exact clean references and fails all drift cases", () => {
  assert.equal(reconcileReferences(rows(), inventory())[0].bytes, payload.length);
  const held = rows(); held.reservations[0].state = "held";
  const unlinked = rows(); unlinked.reservations[0].build_id = "other";
  const duplicate = rows(); duplicate.builds.push(duplicate.builds[0]);
  for (const altered of [held, unlinked, duplicate, { ...rows(), legacyAttachments: 1 }, { ...rows(), reservations: [] }]) assert.throws(() => reconcileReferences(altered, inventory()));
  for (const altered of [[], [...inventory(), ...inventory()], [{ ...inventory()[0], bytes: payload.length + 1 }], [{ ...inventory()[0], key: "../escape" }]]) assert.throws(() => reconcileReferences(rows(), altered));
});

test("media and attachments must be clean and have exclusive, correctly sized stored reservations", () => {
  const mediaKey = `media/${id}/${id}.webp`;
  const media = { builds: [], media: [{ id, object_key: mediaKey, size_bytes: payload.length, scan_state: "clean" }], attachments: [],
    reservations: [{ id: reservationId, build_id: null, media_id: id, state: "stored", bytes: payload.length }] };
  assert.equal(reconcileReferences(media, [{ ...inventory()[0], key: mediaKey }])[0].kind, "media");
  assert.throws(() => reconcileReferences({ ...media, media: [{ ...media.media[0], scan_state: "rejected" }] }, [{ ...inventory()[0], key: mediaKey }]));
  const attachmentKey = `attachments/${id}/${id}/diagnostic.log`;
  const attachment = { builds: [], media: [], attachments: [{ id, object_key: attachmentKey, size_bytes: payload.length, scan_state: "clean", reservation_id: reservationId }],
    reservations: [{ id: reservationId, build_id: null, media_id: null, state: "stored", bytes: payload.length }] };
  assert.equal(reconcileReferences(attachment, [{ ...inventory()[0], key: attachmentKey }])[0].kind, "attachment");
  assert.throws(() => reconcileReferences({ ...attachment, attachments: [{ ...attachment.attachments[0], size_bytes: 0 }] }, [{ ...inventory()[0], key: attachmentKey }]));
});

test("manifest rejects traversal, duplicates, impossible sizes and excessive table counts", () => {
  assert.ok(validateManifest(manifest()).length);
  const traversal = manifest(); traversal.entries[1].name = "../../outside";
  const oversized = manifest(); oversized.entries[0].bytes = LIMITS.dumpBytes + 1;
  const badHash = manifest(); badHash.entries[1].sha256 = "not-a-hash";
  const badRows = manifest(); badRows.database.tableCounts.users = 100001;
  for (const altered of [traversal, oversized, badHash, badRows, { ...manifest(), entries: [] }]) assert.throws(() => validateManifest(altered));
});

test("bounded copy deletes its own partial output but never an existing destination", async () => temporary(async directory => {
  const output = path.join(directory, "bounded.bin");
  await assert.rejects(copyBounded(Readable.from([Buffer.alloc(10)]), output, 9));
  assert.deepEqual(await readdir(directory), []);
  await assert.rejects(copyBounded(Readable.from([Buffer.alloc(2)]), output, 9, 3));
  assert.deepEqual(await readdir(directory), []);
  await writeFile(output, "preserve");
  await assert.rejects(copyBounded(Readable.from([Buffer.from("replace")]), output, 20));
  assert.equal(await readFile(output, "utf8"), "preserve");
}));

test("authenticated encrypted roundtrip preserves every entry hash and uses random IVs", async () => temporary(async directory => {
  const { output, files } = await fixture(directory); const second = path.join(directory, "second.bmbak");
  await encryptArchive({ manifest: manifest(), files, key, output: second });
  assert.notDeepEqual(await readFile(output), await readFile(second));
  const target = path.join(directory, "decode"); await mkdir(target);
  const restored = await decryptArchive({ input: output, key, directory: target });
  assert.deepEqual(restored.manifest, manifest());
  assert.deepEqual(await readFile(restored.files[0]), dump); assert.deepEqual(await readFile(restored.files[1]), payload);
  assert.ok(restored.files.every(file => path.dirname(file) === target));
}));

test("wrong keys and changes to header, ciphertext or tag never produce entry files", async () => temporary(async directory => {
  const { output } = await fixture(directory); const source = await readFile(output);
  for (const offset of [8, 25, source.length - 1]) {
    const corrupted = Buffer.from(source); corrupted[offset] ^= 1;
    const file = path.join(directory, `corrupt-${offset}`); await writeFile(file, corrupted);
    const target = path.join(directory, `target-${offset}`); await mkdir(target);
    await assert.rejects(decryptArchive({ input: file, key, directory: target }), /authentication/);
    assert.deepEqual(await readdir(target), []);
  }
  const target = path.join(directory, "wrong-key"); await mkdir(target);
  await assert.rejects(decryptArchive({ input: output, key: randomBytes(32), directory: target }), /authentication/);
  assert.deepEqual(await readdir(target), []);
}));

test("authenticated malicious paths, wrong hashes and surplus payload still fail verification", async () => temporary(async directory => {
  const badPath = manifest(); badPath.entries[1].name = "objects/../../escape";
  const badHash = manifest(); badHash.entries[1].sha256 = "0".repeat(64);
  const cases: Array<[ReturnType<typeof manifest>, Buffer]> = [[badPath, Buffer.concat([dump, payload])], [badHash, Buffer.concat([dump, payload])], [manifest(), Buffer.concat([dump, payload, Buffer.from("extra")])]];
  for (let i = 0; i < cases.length; i++) {
    const input = path.join(directory, `forged-${i}`); const target = path.join(directory, `target-${i}`); await mkdir(target);
    await forged(input, cases[i][0], cases[i][1]);
    await assert.rejects(decryptArchive({ input, key, directory: target }));
  }
  assert.equal((await readdir(directory)).includes("escape"), false);
}));

test("truncated and oversized encrypted files are refused before extraction", async () => temporary(async directory => {
  const target = path.join(directory, "decode"); await mkdir(target);
  const input = path.join(directory, "bad.bmbak"); await writeFile(input, "tiny");
  await assert.rejects(decryptArchive({ input, key, directory: target }), /encrypted-size/);
  const handle = await open(input, "w"); await handle.truncate(LIMITS.archiveBytes + 1); await handle.close();
  await assert.rejects(decryptArchive({ input, key, directory: target }), /encrypted-size/);
  assert.deepEqual(await readdir(target), []);
}));

test("a changed source fails encryption without publishing a partial archive", async () => temporary(async directory => {
  const { files } = await fixture(directory); await writeFile(files[1], Buffer.alloc(payload.length, 0x61));
  const output = path.join(directory, "changed.bmbak");
  await assert.rejects(encryptArchive({ manifest: manifest(), files, key, output }), /entry-source-changed/);
  assert.equal((await readdir(directory)).includes("changed.bmbak"), false);
}));

test("PostgreSQL subprocess output is bounded and failures redact stderr", async () => {
  const env = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" };
  const result = await pgCommand(process.execPath, ["-e", "process.stdout.write('pg_dump (PostgreSQL) 18.6')"], env);
  assert.ok(typeof result === "string");
  assert.match(result, /18.6/);
  await assert.rejects(pgCommand(process.execPath, ["-e", "process.stderr.write('sensitive-example');process.exit(1)"], env), error =>
    error instanceof Error && error.message === "postgres-command-failed" && !error.message.includes("sensitive"));
  await assert.rejects(pgCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(100))"], env, { maxBytes: 10 }));
});
