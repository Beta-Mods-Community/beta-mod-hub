import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./db";
import { accountTokens, users } from "../db/schema";
import { isAccountToken, newAccountToken, tokenDigest, type AccountTokenPurpose } from "./account-policy";
import { sendAccountMail } from "./account-mail";
import { consumeRateLimit } from "./account-rate-limit";

export const RATE_RULES = {
  login: { perAccount: 8, global: 120, seconds: 900 },
  signup: { perAccount: 3, global: 30, seconds: 3600 },
  recovery: { perAccount: 3, global: 30, seconds: 3600 },
  verification: { perAccount: 3, global: 30, seconds: 3600 },
  password: { perAccount: 8, global: 120, seconds: 900 },
  // Purpose-scoped on purpose: verification spam must not be able to block
  // password recovery and vice versa. Correction/verification tokens are only
  // ever charged against these buckets when redemption FAILS (see
  // account-actions.ts), so a flood of random well-formed tokens cannot lock
  // legitimate users out of their own mailbox links. The per-guess bucket
  // still bounds retries against one real token.
  tokenVerify: { perAccount: 5, global: 120, seconds: 900 },
  tokenReset: { perAccount: 5, global: 60, seconds: 900 },
} as const;

/** Shared across instances/restarts. Global bucket also bounds random-email attacks. */
export async function takeAuthAttempt(kind: keyof typeof RATE_RULES, identity: string): Promise<boolean> {
  if (!db) throw new Error("Database unavailable.");
  const rule = RATE_RULES[kind];
  const keys = [
    { key: `${kind}:global`, limit: rule.global },
    { key: `${kind}:${tokenDigest(identity.toLowerCase())}`, limit: rule.perAccount },
  ];
  // Each upsert is atomic, including at the time-window boundary. A denied
  // account attempt still counts globally, and cannot grow arbitrary buckets.
  if (!await consumeRateLimit(db, keys, rule.seconds)) return false;
  await db.execute(sql`DELETE FROM auth_rate_limits WHERE reset_at < now() - interval '1 day'`);
  await db.execute(sql`DELETE FROM account_tokens WHERE expires_at < now()`);
  return true;
}

export async function issueAccountToken(userId: string, email: string, purpose: AccountTokenPurpose) {
  if (!db) throw new Error("Database unavailable.");
  const issued = newAccountToken(purpose);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`account-token:${userId}`}, 0))`);
    await tx.delete(accountTokens).where(and(eq(accountTokens.userId, userId), eq(accountTokens.purpose, purpose)));
    await tx.insert(accountTokens).values({ tokenHash: issued.tokenHash, userId, email, purpose, expiresAt: issued.expiresAt });
  });
  try { await sendAccountMail(email, purpose, issued.token); }
  catch {
    await db.delete(accountTokens).where(eq(accountTokens.tokenHash, issued.tokenHash));
    throw new Error("Email could not be sent. Please try again later.");
  }
}

/** DELETE ... RETURNING makes concurrent redemption single-use, in the same transaction as the account change. */
export async function redeemAccountToken(raw: string, purpose: AccountTokenPurpose, passwordHash?: string): Promise<boolean> {
  if (!db || !isAccountToken(raw) || (purpose === "reset-password" && !passwordHash)) return false;
  return db.transaction(async (tx) => {
    const [token] = await tx.delete(accountTokens).where(and(
      eq(accountTokens.tokenHash, tokenDigest(raw)), eq(accountTokens.purpose, purpose),
      gt(accountTokens.expiresAt, new Date()),
    )).returning();
    if (!token) return false;
    const values = purpose === "verify-email"
      ? { emailVerifiedAt: new Date() }
      : { passwordHash, emailVerifiedAt: new Date(), sessionVersion: sql`${users.sessionVersion} + 1` };
    const changed = await tx.update(users).set(values).where(and(
      eq(users.id, token.userId), eq(users.email, token.email), sql`${users.suspendedAt} IS NULL`,
    )).returning({ id: users.id });
    if (!changed.length) return false;
    if (purpose === "reset-password") await tx.delete(accountTokens).where(eq(accountTokens.userId, token.userId));
    return true;
  });
}

/** Current hash in the predicate prevents concurrent password-change races. */
export async function replaceAccountPassword(userId: string, currentHash: string, nextHash: string): Promise<boolean> {
  if (!db) return false;
  return db.transaction(async (tx) => {
    const changed = await tx.update(users).set({ passwordHash: nextHash, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(and(eq(users.id, userId), eq(users.passwordHash, currentHash), sql`${users.suspendedAt} IS NULL`))
      .returning({ id: users.id });
    if (!changed.length) return false;
    await tx.delete(accountTokens).where(eq(accountTokens.userId, userId));
    return true;
  });
}
