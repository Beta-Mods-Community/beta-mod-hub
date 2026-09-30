import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createCloudRequestHandler } from "../scripts/cloud-http-handler.mjs";

// Execute the actual launcher with inert dependencies: no listener, .env reads,
// database, provider calls or application sessions are involved in these tests.
const source = readFileSync("scripts/cloud-server.mjs", "utf8").replace(/^import .*;\r?\n/gm, "");
type Request = { method: string; url: string; headers: Record<string, string> };
type Response = { once: (event: string, callback: () => void) => void; writableFinished: boolean; destroyed: boolean };
type Handler = (request: Request, response: Response) => Promise<void>;

async function startLauncher(overrides: Record<string, string> = {}) {
  const env: Record<string, string> = { APP_URL: "https://pilot.example", PORT: "10000", ...overrides };
  const observed: { nextOrigin?: string; preparedOrigin?: string; request?: Request; listener?: Handler; boundPort?: number; boundHost?: string } = {};
  const fakeProcess = { env, once() {}, exit() { throw new Error("Unexpected process exit"); } };
  const sandbox = {
    process: fakeProcess,
    console: { log() {}, error() {} },
    readFile: async () => JSON.stringify({ config: { experimental: { serverActions: { bodySizeLimit: "9mb" } } } }),
    validateCloudRuntime: () => [], createCloudRequestHandler,
    createMemoryEvidence: () => ({ startup() {}, beginExclusive: () => () => {} }),
    sharp: { concurrency() {}, cache() {} },
    next: () => {
      observed.nextOrigin = env.__NEXT_PRIVATE_ORIGIN;
      return {
        prepare: async () => { observed.preparedOrigin = env.__NEXT_PRIVATE_ORIGIN; },
        getRequestHandler: () => async (request: Request) => { observed.request = request; },
        close: async () => {},
      };
    },
    createServer: (_options: unknown, listener: Handler) => {
      observed.listener = listener;
      return {
        listen: (port: number, hostname: string, ready: () => void) => {
          observed.boundPort = port; observed.boundHost = hostname; ready();
        },
        close() {},
      };
    },
  };
  await runInNewContext(`(async () => { ${source}\n })()`, sandbox);
  return { env, observed };
}

test("cloud launcher sets a fixed HTTP loopback origin before Next prepares behind an HTTPS proxy", async () => {
  const { env, observed } = await startLauncher();
  assert.equal(observed.nextOrigin, "http://127.0.0.1:10000");
  assert.equal(observed.preparedOrigin, observed.nextOrigin);
  assert.equal(observed.boundPort, 10000);
  assert.equal(observed.boundHost, "0.0.0.0");
  assert.equal(env.APP_URL, "https://pilot.example");
});

test("internal origin uses the validated listener port and ignores a stale external override", async () => {
  const { env, observed } = await startLauncher({ PORT: "4321", BIND_HOST: "127.0.0.1", __NEXT_PRIVATE_ORIGIN: "https://wrong.example" });
  assert.equal(observed.nextOrigin, "http://127.0.0.1:4321");
  assert.equal(env.__NEXT_PRIVATE_ORIGIN, observed.nextOrigin);
  assert.equal(observed.boundHost, "127.0.0.1");
  for (const PORT of ["0", "65536", "NaN", "10000/path"]) {
    await assert.rejects(startLauncher({ PORT }), /Invalid PORT/);
  }
});

test("HTTPS forwarded protocol, browser origin and request cookies reach Next unchanged", async () => {
  const { env, observed } = await startLauncher();
  const request = { method: "GET", url: "/login", headers: {
    host: "pilot.example", "x-forwarded-proto": "https", origin: "https://pilot.example", cookie: "synthetic=unchanged",
  } };
  const originalHeaders = { ...request.headers };
  assert.ok(observed.listener);
  await observed.listener(request, { once() {}, writableFinished: true, destroyed: false });
  assert.equal(observed.request, request);
  assert.deepEqual(request.headers, originalHeaders);
  assert.equal(env.APP_URL, "https://pilot.example");
  assert.equal(Object.hasOwn(env, "NODE_TLS_REJECT_UNAUTHORIZED"), false);
});
