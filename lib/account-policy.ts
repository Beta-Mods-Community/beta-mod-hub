import { createHash, randomBytes } from "node:crypto";

export type AccountTokenPurpose = "verify-email" | "reset-password";
export const ACCOUNT_TOKEN_TTL_MS = {
  "verify-email": 24 * 60 * 60 * 1000,
  "reset-password": 30 * 60 * 1000,
} as const;

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newAccountToken(purpose: AccountTokenPurpose, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: tokenDigest(token), expiresAt: new Date(now + ACCOUNT_TOKEN_TTL_MS[purpose]) };
}

export function isAccountToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function isLoopbackUrl(raw: string | undefined): boolean {
  try {
    const url = new URL(raw ?? "");
    return ["http:", "https:"].includes(url.protocol)
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && !url.username && !url.password;
  } catch { return false; }
}

export function allowsUnverifiedLocalAccounts(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production"
    && env.AUTH_ALLOW_UNVERIFIED_LOCAL === "true"
    && isLoopbackUrl(env.APP_URL);
}

export function sessionVersionMatches(claim: unknown, current: number): boolean {
  // Existing signed sessions had no version. Their lifetime ends on the first
  // password reset/change, which increments the user's database version.
  const version = claim === undefined ? 0 : claim;
  return typeof version === "number" && Number.isSafeInteger(version)
    && version >= 0 && version === current;
}
