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
  assert.deepEqual(logs.map(line => JSON.parse(line)), [{ event: "cloud-action-response", status: 403, contentType: "text/html" }]);
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
