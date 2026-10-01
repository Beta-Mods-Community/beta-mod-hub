import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCOUNT_TOKEN_TTL_MS, allowsUnverifiedLocalAccounts, isAccountToken, newAccountToken, sessionVersionMatches, tokenDigest } from "../lib/account-policy";
import { AccountEmailSchema, NewPasswordFormSchema, PasswordSchema } from "../lib/account-validation";

describe("account credential and token policy", () => {
  it("normalizes email identity and limits new passwords by bcrypt UTF-8 bytes", () => {
    assert.equal(AccountEmailSchema.parse(" Person@Example.test "), "person@example.test");
    assert.equal(PasswordSchema.safeParse("a".repeat(72)).success, true);
    assert.equal(PasswordSchema.safeParse("a".repeat(73)).success, false);
    assert.equal(PasswordSchema.safeParse("🐉".repeat(18)).success, true);
    assert.equal(PasswordSchema.safeParse("🐉".repeat(19)).success, false);
    assert.equal(PasswordSchema.safeParse(" ".repeat(12)).success, false);
    assert.equal(NewPasswordFormSchema.safeParse({ password: "long password one", confirmPassword: "long password two" }).success, false);
  });
  it("uses random single-use-token material with hashes and bounded purpose-specific expiry", () => {
    const reset = newAccountToken("reset-password", 1000);
    const verification = newAccountToken("verify-email", 1000);
    assert.ok(isAccountToken(reset.token));
    assert.ok(isAccountToken(verification.token));
    assert.ok(reset.token !== verification.token);
    assert.equal(reset.tokenHash, tokenDigest(reset.token));
    assert.ok(reset.tokenHash !== reset.token);
    assert.equal(reset.expiresAt.getTime(), 1000 + ACCOUNT_TOKEN_TTL_MS["reset-password"]);
    assert.equal(verification.expiresAt.getTime(), 1000 + ACCOUNT_TOKEN_TTL_MS["verify-email"]);
    for (const invalid of [null, "", "a".repeat(42), "a".repeat(44), "<script>"]) assert.equal(isAccountToken(invalid), false);
  });
  it("revokes legacy and versioned sessions after a password-version change", () => {
    assert.equal(sessionVersionMatches(undefined, 0), true);
    assert.equal(sessionVersionMatches(undefined, 1), false);
    assert.equal(sessionVersionMatches(2, 2), true);
    for (const invalid of [0, 1, 3, "2", null, NaN, -1, 2.1]) assert.equal(sessionVersionMatches(invalid, 2), false);
  });
  it("never enables the local unverified-account exception in production or for a public origin", () => {
    const development = { NODE_ENV: "development", AUTH_ALLOW_UNVERIFIED_LOCAL: "true", APP_URL: "http://127.0.0.1:3000" } as NodeJS.ProcessEnv;
    assert.equal(allowsUnverifiedLocalAccounts(development), true);
    assert.equal(allowsUnverifiedLocalAccounts({ ...development, NODE_ENV: "production" }), false);
    assert.equal(allowsUnverifiedLocalAccounts({ ...development, APP_URL: "https://betamods.com" }), false);
    assert.equal(allowsUnverifiedLocalAccounts({ ...development, APP_URL: "http://localhost.evil.test" }), false);
    assert.equal(allowsUnverifiedLocalAccounts({ ...development, AUTH_ALLOW_UNVERIFIED_LOCAL: "false" }), false);
  });
});
