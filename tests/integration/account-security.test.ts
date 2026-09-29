import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { newAccountToken, tokenDigest } from "../../lib/account-policy";

const root = path.join(import.meta.dirname, "..", "..");
function envFile(name: string) { try { return readFileSync(path.join(root, name), "utf8"); } catch { return ""; } }
function value(raw: string, key: string) { return raw.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? ""; }
function endpoint(raw: string) { try { const url = new URL(raw); return `${url.hostname.replace("-pooler", "")}${url.pathname}`; } catch { return ""; } }
const dev = envFile(".env.local");
const devUrl = value(dev, "DATABASE_URL");
const prodUrl = value(envFile(".env.production"), "DATABASE_URL");
const safe = Boolean(endpoint(devUrl)) && Boolean(endpoint(prodUrl)) && endpoint(devUrl) !== endpoint(prodUrl);
const describeDb = safe ? describe : describe.skip;
type Db = typeof import("../../lib/db");
let database: NonNullable<Db["db"]>;
let client: Db["client"];
let schema: typeof import("../../db/schema");
let security: typeof import("../../lib/account-security");
let sessions: typeof import("../../lib/session");
let rateLimits: typeof import("../../lib/account-rate-limit");
const userId = randomUUID();
const email = `auth-test-${userId}@betamods.test`;
const rateBuckets = [
  { key: `auth-test:${userId}:global`, limit: 120 },
  { key: `auth-test:${userId}:account`, limit: 8 },
];
const previewDir = path.join(homedir(), ".betamods-dev-mail");
const previewFiles = new Set<string>();

async function insertToken(purpose: "verify-email" | "reset-password", expired = false) {
  const issued = newAccountToken(purpose);
  await database.delete(schema.accountTokens).where(eq(schema.accountTokens.userId, userId));
  await database.insert(schema.accountTokens).values({ tokenHash: issued.tokenHash, userId, email, purpose, expiresAt: expired ? new Date(Date.now() - 1000) : issued.expiresAt });
  return issued.token;
}

describeDb("account security transactions (dev database)", () => {
  before(async () => {
    Object.assign(process.env, { DATABASE_URL: devUrl, NODE_ENV: "development", APP_URL: "http://127.0.0.1:3000", AUTH_MAIL_MODE: "preview", SESSION_SECRET: value(dev, "SESSION_SECRET") });
    const databaseModule = await import("../../lib/db");
    database = databaseModule.db!;
    client = databaseModule.client;
    schema = await import("../../db/schema");
    security = await import("../../lib/account-security");
    sessions = await import("../../lib/session");
    rateLimits = await import("../../lib/account-rate-limit");
    await database.insert(schema.users).values({ id: userId, email, displayName: "Account integration fixture", passwordHash: "initial-test-hash" });
  });
  after(async () => {
    if (database) {
      await database.delete(schema.users).where(eq(schema.users.id, userId));
      await database.delete(schema.authRateLimits).where(inArray(schema.authRateLimits.key, rateBuckets.map(bucket => bucket.key)));
    }
    for (const file of previewFiles) await unlink(file).catch(() => {});
    await client?.end();
  });

  it("redeems verification exactly once under simultaneous requests", async () => {
    const token = await insertToken("verify-email");
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => security.redeemAccountToken(token, "verify-email")));
    assert.equal(outcomes.filter(Boolean).length, 1);
    const [user] = await database.select().from(schema.users).where(eq(schema.users.id, userId));
    assert.ok(user.emailVerifiedAt);
  });
  it("rejects expired tokens and a token presented for the wrong purpose", async () => {
    const expired = await insertToken("verify-email", true);
    assert.equal(await security.redeemAccountToken(expired, "verify-email"), false);
    const fresh = await insertToken("verify-email");
    assert.equal(await security.redeemAccountToken(fresh, "reset-password", "next-hash"), false);
    assert.equal(await security.redeemAccountToken(fresh, "verify-email"), true);
  });
  it("resets atomically, rejects replay, and invalidates every earlier signed session", async () => {
    const cookie = await sessions.encrypt({ userId, sessionVersion: 0, expiresAt: new Date(Date.now() + 60000) });
    assert.ok(await sessions.decrypt(cookie));
    const reset = await insertToken("reset-password");
    assert.equal(await security.redeemAccountToken(reset, "reset-password", "reset-test-hash"), true);
    assert.equal(await security.redeemAccountToken(reset, "reset-password", "attacker-test-hash"), false);
    assert.equal(await sessions.decrypt(cookie), null);
    const [user] = await database.select().from(schema.users).where(eq(schema.users.id, userId));
    assert.equal(user.passwordHash, "reset-test-hash");
    assert.equal(user.sessionVersion, 1);
  });
  it("password changes reject stale credentials and revoke outstanding reset links", async () => {
    const reset = await insertToken("reset-password");
    assert.equal(await security.replaceAccountPassword(userId, "wrong-old-hash", "changed-test-hash"), false);
    assert.equal(await security.replaceAccountPassword(userId, "reset-test-hash", "changed-test-hash"), true);
    assert.equal(await security.redeemAccountToken(reset, "reset-password", "unwanted-test-hash"), false);
    const [user] = await database.select().from(schema.users).where(eq(schema.users.id, userId));
    assert.equal(user.sessionVersion, 2);
  });
  it("suspended accounts cannot use a correctly signed session", async () => {
    const cookie = await sessions.encrypt({ userId, sessionVersion: 2, expiresAt: new Date(Date.now() + 60000) });
    await database.update(schema.users).set({ suspendedAt: new Date() }).where(eq(schema.users.id, userId));
    assert.equal(await sessions.decrypt(cookie), null);
    await database.update(schema.users).set({ suspendedAt: null }).where(eq(schema.users.id, userId));
  });
  it("limits simultaneous attempts atomically and reopens after the window", async () => {
    const attempt = () => rateLimits.consumeRateLimit(database, rateBuckets, 900);
    const outcomes = await Promise.all(Array.from({ length: 12 }, attempt));
    assert.equal(outcomes.filter(Boolean).length, 8);
    await database.update(schema.authRateLimits).set({ resetAt: sql`now() - interval '1 second'` }).where(eq(schema.authRateLimits.key, rateBuckets[1].key));
    assert.equal(await attempt(), true);
  });
  it("writes local mail privately, keeps raw tokens out of DB, and invalidates a replaced link", async () => {
    async function issueAndRead() {
      const before = new Set(await readdir(previewDir).catch(() => [] as string[]));
      await security.issueAccountToken(userId, email, "verify-email");
      const names = (await readdir(previewDir)).filter((name) => !before.has(name));
      let token = "";
      for (const name of names) {
        const file = path.join(previewDir, name);
        const mail = JSON.parse(await readFile(file, "utf8"));
        if (mail.to !== email) continue;
        previewFiles.add(file);
        const link = String(mail.text).match(/http:\/\/127\.0\.0\.1:3000\/verify-email\?token=([A-Za-z0-9_-]+)/);
        token = link?.[1] ?? "";
      }
      assert.ok(token, "A private local verification preview was created");
      return token;
    }
    const old = await issueAndRead();
    const current = await issueAndRead();
    const rows = await database.select().from(schema.accountTokens).where(eq(schema.accountTokens.userId, userId));
    assert.equal(rows.length, 1);
    assert.ok(rows[0].tokenHash === tokenDigest(current), "Only the latest token hash is stored");
    assert.equal(await security.redeemAccountToken(old, "verify-email"), false);
    assert.equal(await security.redeemAccountToken(current, "verify-email"), true);
  });
});
