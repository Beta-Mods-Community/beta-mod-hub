import assert from "node:assert/strict";
import test from "node:test";
import config from "../next.config";

test("all Next responses prevent framing and content-type sniffing", async () => {
  const rules = await config.headers!();
  const rule = rules.find(rule => rule.source === "/:path*");
  assert.ok(rule);
  const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers["content-security-policy"], undefined, "Global config must not replace the gate's stricter CSP");
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["x-content-type-options"], "nosniff");
  // Route-specific privacy, gate CSP and native form-origin handling remain separate.
  assert.equal(headers["cache-control"], undefined);
  assert.equal(headers["referrer-policy"], undefined);
});
