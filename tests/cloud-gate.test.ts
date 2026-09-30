import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
// Next 16.3.6 still exports the legacy helper name despite the Proxy docs.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "../src/proxy";
import { makePilotCookie, PILOT_COOKIE } from "../lib/cloud-pilot";

async function withPilot(action: () => Promise<void>, flag = "on") {
  const values = {
    CLOUD_PILOT: flag,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    PILOT_ACCESS_KEY: randomBytes(32).toString("hex"),
    APP_URL: "https://private-pilot.invalid",
  };
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { await action(); }
  finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("the gate matches static paths and refuses action-like POSTs before Next dispatch", async () => {
  await withPilot(async () => {
    for (const pathname of ["/privacy", "/images/missing.png", "/_next/static/missing.js", "/favicon.ico"]) {
      assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: pathname }), true, pathname);
      const response = await proxy(new NextRequest(`http://127.0.0.1:3999${pathname}`, {
        method: "POST", headers: { "Next-Action": "0".repeat(40), "Content-Length": "2" }, body: "[]",
      }));
      assert.equal(response.status, 401, pathname);
      assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    }
  });
});

test("private redirects use APP_URL and retain verification links without referrer disclosure", async () => {
  await withPilot(async () => {
    const response = await proxy(new NextRequest("http://untrusted-host.invalid/verify-email?token=synthetic"));
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get("Location")!);
    assert.equal(location.origin, "https://private-pilot.invalid");
    assert.equal(location.pathname, "/pilot-access");
    assert.equal(location.searchParams.get("returnTo"), "/verify-email?token=synthetic");
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  }, "true");
});

test("a gate cookie permits account entry pages while tampered cookies remain blocked", async () => {
  await withPilot(async () => {
    const token = await makePilotCookie();
    for (const pathname of ["/login", "/signup"]) {
      const valid = await proxy(new NextRequest(`http://127.0.0.1:3999${pathname}`, {
        headers: { Cookie: `${PILOT_COOKIE}=${token}` },
      }));
      assert.equal(valid.headers.get("x-middleware-next"), "1");
      assert.match(valid.headers.get("Cache-Control") ?? "", /no-store/);
      const invalid = await proxy(new NextRequest(`http://127.0.0.1:3999${pathname}`, {
        headers: { Cookie: `${PILOT_COOKIE}=${token}x` },
      }));
      assert.equal(invalid.status, 307);
    }
  });
});
