// Inventory the R2 bucket that holds the pilot's final mod archives.
//
// Why this exists: since R2 became the final store, the Docker volume is only
// quarantine scratch, so "back up the volume" no longer protects anyone's mod.
// R2 is the only copy of the archives and Neon is only the index. This script
// records what the bucket actually holds, and cross-checks it against the
// database so two specific failures are visible rather than silent:
//
//   orphaned objects  -- in the bucket, no builds row points at them.
//                        Someone's storage budget is being spent on nothing.
//   missing objects   -- a builds row points at a key that is not there.
//                        That download will 404.
//
// It writes a JSON record into the backup folder alongside the database dump.
// It is a RECORD, not a copy: this deliberately does not mirror the bucket,
// because a second copy of the same archives would double the storage bill and
// push the pilot past Cloudflare's free allowance. See DEPLOY-HOME.md.
//
// Credentials come from .env.home (the production file) or .env.local. Secrets
// are never printed.
//
// Usage:
//   node scripts/r2-inventory.mjs --out C:\betamods-backups\r2-inventory.json
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readEnvFile(file) {
  try {
    const raw = readFileSync(path.join(root, file), "utf8");
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].trim();
    }
    return env;
  } catch {
    return {};
  }
}

// .env.home first: this describes the production bucket. .env.local is the
// fallback so the tool still works on a dev machine mid-setup.
const env = { ...readEnvFile(".env.local"), ...readEnvFile(".env.home") };

const STORAGE_ENDPOINT = env.STORAGE_ENDPOINT;
const STORAGE_BUCKET = env.STORAGE_BUCKET;
const STORAGE_ACCESS_KEY = env.STORAGE_ACCESS_KEY;
const STORAGE_SECRET_KEY = env.STORAGE_SECRET_KEY;
const DATABASE_URL = env.DATABASE_URL;

const outIndex = process.argv.indexOf("--out");
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;

if (!STORAGE_ENDPOINT || !STORAGE_BUCKET || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
  console.error(
    "R2 credentials incomplete (need STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY in .env.home or .env.local)",
  );
  process.exit(1);
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${Math.round(value * 10) / 10} ${units[unit]}`;
}

const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
const client = new S3Client({
  region: "auto",
  endpoint: STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: STORAGE_ACCESS_KEY,
    secretAccessKey: STORAGE_SECRET_KEY,
  },
});

const objects = [];
let continuationToken;
do {
  const page = await client.send(
    new ListObjectsV2Command({ Bucket: STORAGE_BUCKET, ContinuationToken: continuationToken }),
  );
  for (const item of page.Contents ?? []) {
    if (item.Key) objects.push({ key: item.Key, size: Number(item.Size ?? 0) });
  }
  continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (continuationToken);

const totalBytes = objects.reduce((sum, object) => sum + object.size, 0);

// --- cross-check against the database index --------------------------------
let drift = null;
if (DATABASE_URL) {
  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(DATABASE_URL, { max: 1 });
    try {
      const rows = await sql`select file_url from builds`;
      const known = new Set(rows.map((row) => row.file_url));
      const present = new Set(objects.map((object) => object.key));
      drift = {
        orphanedObjects: objects.filter((o) => !known.has(o.key)).map((o) => o.key),
        missingObjects: [...known].filter((key) => !present.has(key)),
      };
    } finally {
      await sql.end();
    }
  } catch {
    // A missing database is not a bucket problem: the listing above is still
    // the useful half, so report the gap rather than failing the run.
    drift = { error: "database unreachable; drift check skipped" };
  }
} else {
  drift = { error: "no DATABASE_URL; drift check skipped" };
}

const report = {
  generatedAt: new Date().toISOString(),
  bucket: STORAGE_BUCKET,
  totals: { objects: objects.length, bytes: totalBytes, human: human(totalBytes) },
  objects,
  drift,
};

if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`written: ${outPath}`);
}

console.log(`bucket:  ${STORAGE_BUCKET}`);
console.log(`objects: ${objects.length}`);
console.log(`bytes:   ${totalBytes} (${human(totalBytes)})`);

if (drift?.error) {
  console.log(`drift:   not checked (${drift.error})`);
} else {
  console.log(`orphaned objects (in bucket, no build row): ${drift.orphanedObjects.length}`);
  console.log(`missing objects (build row, not in bucket):  ${drift.missingObjects.length}`);
  for (const key of drift.orphanedObjects.slice(0, 10)) {
    console.log(`  orphan  ${key}`);
  }
  for (const key of drift.missingObjects.slice(0, 10)) {
    console.log(`  MISSING ${key}`);
  }
  if (drift.orphanedObjects.length === 0 && drift.missingObjects.length === 0) {
    console.log("drift:   none — every object is indexed and every index has an object");
  }
}
