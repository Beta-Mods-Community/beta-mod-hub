// One-time R2 provisioning: bucket + bucket-scoped S3 credentials.
//
// Requires a bootstrap API token with:
//   - Account > Workers R2 Storage > Edit   (bucket creation)
//   - User > API Tokens > Edit              (token minting)
// Put it in .env.local as CLOUDFLARE_API_TOKEN (gitignored). Never prints
// secrets — only account/bucket/token-id metadata.
//
// S3 key derivation (per Cloudflare docs, r2/api/tokens):
//   Access Key ID     = the minted API token's id
//   Secret Access Key = SHA-256 hash of the minted token's value
// The docs don't pin the digest encoding, so we probe the bucket with both
// hex and base64 encodings and adopt whichever authenticates.
//
// Usage: node scripts/setup-r2.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = path.join(root, ".env.local");
const envRaw = readFileSync(envFile, "utf8");
const env = (key) => {
  const m = envRaw.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim() : "";
};

const TOKEN = env("CLOUDFLARE_API_TOKEN");
if (!TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN missing from .env.local");
  process.exit(1);
}

const BUCKET = env("STORAGE_BUCKET") || "betamods-storage";
const TOKEN_NAME = "betamods-r2-storage";
const API = "https://api.cloudflare.com/client/v4";

async function cf(pathname, { method = "GET", body } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) {
    const errs = json.errors?.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`CF API ${method} ${pathname} failed — ${errs ?? res.status}`);
  }
  return json.result;
}

// 1. Account
const accounts = await cf("/accounts?per_page=50");
if (accounts.length === 0) throw new Error("no accounts on this token");
const account = accounts[0];
console.log(`account: ${account.name} (${account.id})`);
if (accounts.length > 1) {
  console.warn(
    `WARNING: ${accounts.length} accounts on this token; using the first. ` +
      accounts.map((a) => `${a.name}=${a.id}`).join(", "),
  );
}
const ACCOUNT_ID = account.id;

// 2. Bucket
try {
  await cf(`/accounts/${ACCOUNT_ID}/r2/buckets`, {
    method: "POST",
    body: { name: BUCKET, jurisdiction: "default" },
  });
  console.log(`bucket created: ${BUCKET}`);
} catch (err) {
  if (/already exists|bucket.*exist/i.test(err.message)) {
    console.log(`bucket already exists: ${BUCKET}`);
  } else {
    throw err;
  }
}

// 3. Drop any previously provisioned r2 tokens (by our name), then mint fresh.
const existing = await cf("/user/tokens");
for (const t of existing) {
  if (t.name.startsWith(TOKEN_NAME)) {
    await cf(`/user/tokens/${t.id}`, { method: "DELETE" });
    console.log(`removed stale token: ${t.id}`);
  }
}

const groups = await cf("/user/tokens/permission_groups");
const gid = (name) => {
  const g = groups.find((g) => g.name === name);
  if (!g) throw new Error(`permission group not found: ${name}`);
  return g.id;
};
const minted = await cf("/user/tokens", {
  method: "POST",
  body: {
    name: TOKEN_NAME,
    policies: [
      {
        effect: "allow",
        resources: {
          [`com.cloudflare.edge.r2.bucket.${ACCOUNT_ID}_default_${BUCKET}`]: "*",
        },
        permission_groups: [
          { id: gid("Workers R2 Storage Bucket Item Read") },
          { id: gid("Workers R2 Storage Bucket Item Write") },
        ],
      },
    ],
  },
});
const ACCESS_KEY = minted.id;
console.log(`token minted: ${ACCESS_KEY} (${minted.name})`);

// 4. Determine the secret encoding empirically.
const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
const digest = createHash("sha256").update(minted.value).digest();
const candidates = [
  ["hex", digest.toString("hex")],
  ["base64", digest.toString("base64")],
];
const newS3 = (secret) =>
  new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: secret },
  });
const probe = async (s3) => {
  try {
    await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, MaxKeys: 1 }));
    return true;
  } catch {
    return false;
  }
};

let secret = null;
for (const [name, candidate] of candidates) {
  const client = newS3(candidate);
  const ok = await probe(client);
  console.log(`s3 probe [${name}]: ${ok ? "OK" : "401/denied"}`);
  if (ok && !secret) secret = candidate;
}
if (!secret) {
  // Possibly creation propagation lag — give it a beat, then retry once.
  console.log("no candidate authenticated yet — waiting 10s and retrying…");
  await new Promise((r) => setTimeout(r, 10_000));
  for (const [name, candidate] of candidates) {
    const ok = await probe(newS3(candidate));
    console.log(`s3 probe retry [${name}]: ${ok ? "OK" : "401/denied"}`);
    if (ok && !secret) secret = candidate;
  }
}
if (!secret) {
  await cf(`/user/tokens/${ACCESS_KEY}`, { method: "DELETE" });
  throw new Error(
    "neither hex nor base64 secret authenticated — R2 token not recognized yet; re-run in a minute",
  );
}
console.log(`secret encoding: ${digest.toString("base64") === secret ? "base64" : "hex"}`);

// 5. Wire .env.local (set-or-append, preserving everything else)
const setEnv = (next, key, value) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  return re.test(next) ? next.replace(re, line) : `${next}\n${line}`;
};
let next = envRaw;
next = setEnv(next, "STORAGE_DRIVER", "r2");
next = setEnv(next, "STORAGE_BUCKET", BUCKET);
next = setEnv(
  next,
  "STORAGE_ENDPOINT",
  `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
);
next = setEnv(next, "STORAGE_ACCESS_KEY", ACCESS_KEY);
next = setEnv(next, "STORAGE_SECRET_KEY", secret);
writeFileSync(envFile, next.endsWith("\n") ? next : `${next}\n`);

// 6. Final confirm
const listed = await newS3(secret).send(
  new ListObjectsV2Command({ Bucket: BUCKET, MaxKeys: 5 }),
);
console.log(
  `r2 ok: bucket "${BUCKET}", ${listed.KeyCount ?? 0} object(s) — STORAGE_* written to .env.local`,
);