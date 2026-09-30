import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ACTION_DIAGNOSTIC_LIMIT, ACTION_DIAGNOSTIC_WINDOW_MS, installCloudActionDiagnostics } from "../src/lib/cloud-action-diagnostics";

const origin = "https://pilot.example";
const action = { method: "POST", headers: { "Next-Action": "secret-action", Cookie: "secret-cookie" }, body: "secret-body" };

test("cloud action observer forwards exact arguments/receiver and returns original promise/response without reading bodies", async () => {
  const response = new Response("private body", { status: 403, headers: { "content-type": "text/html; charset=utf-8", "x-secret": "secret" } });
  response.clone = () => { throw new Error("must not clone"); };
  const pending = Promise.resolve(response); const calls: unknown[][] = []; const receivers: unknown[] = []; const logs: string[] = [];
  const original = function (this: unknown, ...args: unknown[]) { calls.push(args); receivers.push(this); return pending; };
  const target = { fetch: original as typeof fetch };
  installCloudActionDiagnostics(target, { enabled: true, origin, writeLine: line => logs.push(line) });
  const result = target.fetch("/mods/private-id?secret=query", action);
  assert.equal(result, pending); assert.equal(await result, response); assert.equal(response.bodyUsed, false);
  assert.equal(calls.length, 1); assert.equal(calls[0][1], action); assert.equal(receivers[0], target);
  assert.deepEqual(logs.map(line => JSON.parse(line)), [{ event: "cloud-action-response", status: 403, contentType: "text/html",
    redirected: false, responseType: "default", finalSameOrigin: null, cfRay: null }]);
  assert.ok(logs.every(line => !/secret|private|cookie|actionId|url/i.test(line)));
});

test("disabled local target keeps fetch untouched and repeated installation does not duplicate observations", async () => {
  const original: typeof fetch = async () => new Response(null, { headers: { "content-type": "text/x-component" } });
  const target = { fetch: original }; const logs: string[] = [];
  const options = { enabled: false, origin, writeLine: (line: string) => logs.push(line) };
  installCloudActionDiagnostics(target, options); assert.equal(target.fetch, original);
  installCloudActionDiagnostics(target, { ...options, enabled: true }); const wrapped = target.fetch;
  installCloudActionDiagnostics(target, { ...options, enabled: true }); assert.equal(target.fetch, wrapped);
  await target.fetch("/", action); assert.equal(logs.length, 1);
});

test("only same-origin POST action responses are observed, including Request and header-list inputs", async () => {
  const logs: string[] = []; let calls = 0;
  const target = { fetch: (async () => { calls++; return new Response(null); }) as typeof fetch };
  installCloudActionDiagnostics(target, { enabled: true, origin, writeLine: line => logs.push(line) });
  await target.fetch("/read");
  await target.fetch("/ordinary-post", { method: "POST", body: "not-an-action" });
  await target.fetch("https://other.example/", action);
  await target.fetch("/read", { ...action, method: "GET" });
  assert.equal(logs.length, 0);
  await target.fetch(new Request(`${origin}/private`, { method: "POST", headers: new Headers({ "next-action": "secret" }) }));
  await target.fetch(new URL(`${origin}/private`), { method: "POST", headers: [["next-action", "secret"]] });
  assert.equal(logs.length, 2); assert.equal(calls, 6);
  assert.ok(logs.every(line => JSON.parse(line).contentType === "missing"));
});

test("response MIME values are allowlisted, fetch rejection identity is preserved, raw errors stay private", async () => {
  const logs: string[] = []; const problem = new Error("secret network failure"); let reject = false;
  const target = { fetch: (() => reject ? Promise.reject(problem) : Promise.resolve(new Response(null, { headers: { "content-type": "secret/custom" } }))) as typeof fetch };
  installCloudActionDiagnostics(target, { enabled: true, origin, writeLine: line => logs.push(line) });
  await target.fetch("/", action); reject = true;
  await assert.rejects(target.fetch("/", action), error => error === problem);
  assert.deepEqual(logs.map(line => JSON.parse(line)), [
    { event: "cloud-action-response", status: 200, contentType: "other" },
    { event: "cloud-action-fetch-rejected", status: 0, contentType: "unavailable" },
  ]);
});

test("client diagnostics have a fixed log bound and a failing sink does not alter the response", async () => {
  let time = 0; const logs: string[] = []; const response = new Response(null);
  const target = { fetch: (async () => response) as typeof fetch };
  installCloudActionDiagnostics(target, { enabled: true, origin, now: () => time, writeLine: line => logs.push(line) });
  for (let i = 0; i < 30; i++) assert.equal(await target.fetch("/", action), response);
  assert.equal(logs.length, ACTION_DIAGNOSTIC_LIMIT + 1);
  assert.equal(JSON.parse(logs.at(-1)!).event, "cloud-action-diagnostics-limited");
  time = ACTION_DIAGNOSTIC_WINDOW_MS; await target.fetch("/", action); assert.equal(logs.length, ACTION_DIAGNOSTIC_LIMIT + 2);
  const broken = { fetch: (async () => response) as typeof fetch };
  installCloudActionDiagnostics(broken, { enabled: true, origin, writeLine: () => { throw new Error("broken logger"); } });
  assert.equal(await broken.fetch("/", action), response);
});

test("supported instrumentation hook is gated by server cloud boolean without public credentials or env serialization", () => {
  const hook = readFileSync("src/instrumentation-client.ts", "utf8"); const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(hook, /enabled: document\.documentElement\.dataset\.cloudPilot === "on"/);
  assert.match(layout, /data-cloud-pilot=\{isCloudPilot\(\) \? "on" : undefined\}/);
  assert.doesNotMatch(hook, /process\.env|PILOT_ACCESS_KEY|SESSION_SECRET/);
});

test("failed responses expose only a bounded correlation ID and redirect categories, never URL or other headers", async () => {
  const logs: string[] = []; const queried: string[] = [];
  const response = new Response("private-response-body", { status: 403 });
  Object.defineProperties(response, {
    redirected: { value: true }, type: { value: "cors" },
    url: { value: "https://other.example/private-path?secret=private-query" },
    headers: { value: { get(name: string) {
      queried.push(name);
      if (name === "content-type") return " TEXT/HTML ; charset=UTF-8";
      if (name === "cf-ray") return "230b030023ae2822-SJC";
      throw new Error("must not read other response headers");
    } } },
  });
  const target = { fetch: (async () => response) as typeof fetch };
  installCloudActionDiagnostics(target, { enabled: true, origin, writeLine: line => logs.push(line) });
  assert.equal(await target.fetch("/mods/private-id", action), response);
  assert.deepEqual(JSON.parse(logs[0]), { event: "cloud-action-response", status: 403, contentType: "text/html",
    redirected: true, responseType: "cors", finalSameOrigin: false, cfRay: "230b030023ae2822-SJC" });
  assert.deepEqual(queried, ["content-type", "cf-ray"]);
  assert.equal(response.bodyUsed, false);
  assert.doesNotMatch(logs.join(""), /private|secret|other\.example|https:/);
});

test("same-origin failure URLs become booleans while successful responses keep their original diagnostic shape", async () => {
  const logs: string[] = []; let status = 403;
  const target = { fetch: (async () => {
    const response = new Response(null, { status, headers: { "content-type": "text/x-component", "cf-ray": "230b030023ae2822-SJC" } });
    Object.defineProperty(response, "url", { value: `${origin}/private?token=secret` });
    return response;
  }) as typeof fetch };
  installCloudActionDiagnostics(target, { enabled: true, origin, writeLine: line => logs.push(line) });
  await target.fetch("/", action); status = 200; await target.fetch("/", action);
  assert.equal(JSON.parse(logs[0]).finalSameOrigin, true);
  assert.deepEqual(JSON.parse(logs[1]), { event: "cloud-action-response", status: 200, contentType: "text/x-component" });
  assert.doesNotMatch(logs.join(""), /private|secret|token|pilot\.example/);
});

test("malformed or unbounded correlation IDs and MIME headers cannot leak through failure diagnostics", async () => {
  const logs: string[] = [];
  const invalidIds = [null, "", "private-cookie-value", "230b030023ae2822-SJC\n", "230b030023ae2822-SJC?secret=query", "a".repeat(20000)];
  let ray: string | null = null;
  const target = { fetch: (async () => {
    const response = new Response(null, { status: 403 });
    Object.defineProperties(response, {
      type: { value: "private-type" }, url: { value: "invalid secret url" },
      headers: { value: { get: (name: string) => name === "cf-ray" ? ray : "secret/".repeat(1000) } },
    });
    return response;
  }) as typeof fetch };
  installCloudActionDiagnostics(target, { enabled: true, origin, writeLine: line => logs.push(line) });
  for (const value of invalidIds) { ray = value; await target.fetch("/", action); }
  for (const line of logs) {
    assert.deepEqual(JSON.parse(line), { event: "cloud-action-response", status: 403, contentType: "other",
      redirected: false, responseType: "other", finalSameOrigin: null, cfRay: null });
    assert.doesNotMatch(line, /private|secret|cookie|query|invalid/);
  }
});

test("throwing metadata getters cannot swallow the base failure event or alter the original promise", async () => {
  const logs: string[] = []; const response = new Response(null, { status: 403 });
  const fail = () => { throw new Error("private metadata error"); };
  Object.defineProperties(response, {
    headers: { get: fail }, redirected: { get: fail }, type: { get: fail }, url: { get: fail },
  });
  const pending = Promise.resolve(response); const target = { fetch: (() => pending) as typeof fetch };
  installCloudActionDiagnostics(target, { enabled: true, origin, writeLine: line => logs.push(line) });
  const actual = target.fetch("/", action);
  assert.equal(actual, pending); assert.equal(await actual, response);
  assert.deepEqual(JSON.parse(logs[0]), { event: "cloud-action-response", status: 403, contentType: "unavailable",
    redirected: null, responseType: "unavailable", finalSameOrigin: null, cfRay: null });
  assert.doesNotMatch(logs.join(""), /private|metadata error/);
});
