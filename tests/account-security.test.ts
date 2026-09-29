import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RATE_RULES } from "../lib/account-security";

describe("account rate-limit rules", () => {
  it("scopes verification and reset token attempts to separate buckets", () => {
    // Replaced the single `token` kind: verification spam must not be able to
    // block password recovery and vice versa.
    assert.ok("tokenVerify" in RATE_RULES);
    assert.ok("tokenReset" in RATE_RULES);
    assert.ok(!("token" in RATE_RULES));
  });
  it("gives every kind a per-account cap, a global cap and a window", () => {
    for (const [kind, rule] of Object.entries(RATE_RULES)) {
      assert.ok(rule.perAccount >= 1, `${kind}.perAccount`);
      assert.ok(rule.global >= 1, `${kind}.global`);
      assert.ok(rule.seconds >= 60, `${kind}.seconds`);
    }
  });
});