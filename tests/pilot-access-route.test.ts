import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { PILOT_COOKIE, validPilotCookie } from "../lib/cloud-pilot";

const fixture = {
  CLOUD_PILOT: "on",
  SESSION_SECRET: randomBytes(32).toString("hex"),
  PILOT_ACCESS_KEY: randomBytes(32).toString("hex"),
  APP_URL: "https://private-pilot.invalid",
  // postgres-js connects lazily. These paths must never issue a query; never
  // import a real dev or cloud database URL into this unit test process.
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:1/fixture",
};
const saved = Object.fromEntries(Object.keys(fixture).map(key => [key, process.env[key]]));
let route: typeof import("../src/app/pilot-access/route");

before(async () => {
  Object.assign(process.env, fixture);
  route = await import("../src/app/pilot-access/route");
});
after(async () => {
  const { client } = await import("../lib/db");
  await client?.end({ timeout: 0 });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("gate HTML preserves native HTTPS form Origin without referring token-bearing paths", async () => {
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Referrer-Policy"), "strict-origin");
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  assert.match(response.headers.get("Content-Security-Policy") ?? "", /form-action 'self'/);
  assert.match(await response.text(), /<form method="post">/);
});

test("gate share metadata contains public branding only", async () => {
  const html = await (await route.GET()).text();
  assert.match(html, /<meta property="og:title" content="Beta Mods">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/betamods\.com\/images\/beta-mods-mark\.png">/);
  assert.match(html, /<meta name="twitter:card" content="summary">/);
  assert.ok(!html.includes(fixture.PILOT_ACCESS_KEY));
  assert.ok(!html.includes(fixture.SESSION_SECRET));
  assert.ok(!html.includes(fixture.DATABASE_URL));
  assert.doesNotMatch(html, /returnTo|verify-email\?token|property="og:url"/);
});

test("gate rejects null, missing and foreign origins without accepting a correct code", async () => {
  for (const origin of [null, "null", "https://foreign.invalid"]) {
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (origin !== null) headers.Origin = origin;
    const response = await route.POST(new Request(`${fixture.APP_URL}/pilot-access`, {
      method: "POST", headers, body: new URLSearchParams({ code: fixture.PILOT_ACCESS_KEY }),
    }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Set-Cookie"), null);
  }
});

test("same-origin gate POST retains secure cookie and private verification redirect", async () => {
  const destination = "/verify-email?token=synthetic";
  const response = await route.POST(new Request(`${fixture.APP_URL}/pilot-access?returnTo=${encodeURIComponent(destination)}`, {
    method: "POST",
    headers: { Origin: fixture.APP_URL, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: fixture.PILOT_ACCESS_KEY }),
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), fixture.APP_URL + destination);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  const cookie = response.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  const token = cookie.match(new RegExp(`^${PILOT_COOKIE}=([^;]+)`))?.[1];
  assert.equal(await validPilotCookie(token), true);
});
