import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { PassThrough, Writable } from "node:stream";
import { it } from "node:test";
import { createCloudRequestHandler, refuseCloudRequest, REJECTION_DRAIN_BYTES,
  REJECTION_DRAIN_MS, MAX_REJECTION_DRAINS, REQUEST_REFUSAL, BUSY_REFUSAL,
  createAdmissionLogger, MAX_ADMISSION_LOGS, ADMISSION_LOG_WINDOW_MS } from "../scripts/cloud-http-handler.mjs";
import { MAX_BODY_BYTES } from "../scripts/cloud-runtime-policy.mjs";

async function withServer(handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  check: (origin: string) => Promise<void>, onAdmission = () => {}) {
  const server = createServer(createCloudRequestHandler(handle, { onAdmission }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await check(`http://127.0.0.1:${address.port}`); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

for (const connection of ["keep-alive", "close"]) {
  it(`real whole-body 9 MiB+1 upload receives 413 with client Connection:${connection}, without reaching the app`, async () => {
    let dispatched = 0;
    await withServer(async (_req, res) => { dispatched++; res.end("unexpected"); }, async origin => {
      const response = await fetch(`${origin}/mods/new`, {
        method: "POST", headers: { Connection: connection, "Content-Type": "application/octet-stream" },
        body: Buffer.alloc(MAX_BODY_BYTES + 1, 97), signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 413);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("content-length"), String(Buffer.byteLength(REQUEST_REFUSAL)));
      assert.equal(await response.text(), REQUEST_REFUSAL);
      assert.equal(dispatched, 0);
    });
  });
}

it("valid requests still dispatch and overlapping mutation gets a complete 503 without releasing the active slot", async () => {
  let unblock: () => void = () => {};
  let entered: () => void = () => {};
  const blocked = new Promise<void>(resolve => { unblock = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const dispatches: string[] = [];
  const logs: string[] = [];
  await withServer(async (req, res) => {
    dispatches.push(req.url ?? "");
    for await (const chunk of req) assert.ok(Buffer.isBuffer(chunk));
    if (req.url === "/hold") { entered(); await blocked; }
    res.end("ok");
  }, async origin => {
    const active = fetch(`${origin}/hold`, { method: "POST", body: "small", signal: AbortSignal.timeout(5000) });
    try {
      await started;
      const busy = await fetch(`${origin}/busy`, {
        method: "POST", body: Buffer.alloc(1024 * 1024, 98), headers: { Connection: "close" }, signal: AbortSignal.timeout(5000),
      });
      assert.equal(busy.status, 503);
      assert.equal(busy.headers.get("retry-after"), "30");
      assert.equal(await busy.text(), BUSY_REFUSAL);
      const read = await fetch(`${origin}/read`, { signal: AbortSignal.timeout(5000) });
      assert.equal(await read.text(), "ok");
      const stillBusy = await fetch(`${origin}/still-busy`, { method: "POST", body: "x", signal: AbortSignal.timeout(5000) });
      assert.equal(stillBusy.status, 503);
      assert.equal(await stillBusy.text(), BUSY_REFUSAL);
    } finally { unblock(); }
    assert.equal(await (await active).text(), "ok");
    const next = await fetch(`${origin}/next`, { method: "POST", body: "x", signal: AbortSignal.timeout(5000) });
    assert.equal(next.status, 200);
    assert.equal(await next.text(), "ok");
    assert.deepEqual(dispatches, ["/hold", "/read", "/next"]);
  }, createAdmissionLogger({ writeLine: (line: string) => logs.push(line) }));
  assert.deepEqual(logs.map(line => JSON.parse(line)), [
    { event: "cloud-exclusive-start", status: 200, method: "POST", declaredBytes: 5 },
    { event: "cloud-admission-refused", status: 503, method: "POST", declaredBytes: 1024 * 1024 },
    { event: "cloud-admission-refused", status: 503, method: "POST", declaredBytes: 1 },
    { event: "cloud-exclusive-start", status: 200, method: "POST", declaredBytes: 1 },
  ]);
});

class Reply extends Writable {
  status = 0;
  headers: Record<string, string | number> = {};
  body = "";
  writeHead(status: number, headers: Record<string, string | number>) { this.status = status; this.headers = headers; return this; }
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) { this.body += chunk.toString(); callback(); }
}

it("rejection discard reads no more than its byte allowance and never buffers a body copy", async () => {
  const req = new PassThrough(); const res = new Reply();
  const result = refuseCloudRequest(req, res, 413);
  req.write(Buffer.alloc(REJECTION_DRAIN_BYTES + 65536, 97));
  const evidence = await result;
  assert.equal(evidence.reason, "byte-limit");
  assert.equal(evidence.discardedBytes, REJECTION_DRAIN_BYTES);
  assert.equal(req.readableLength, 65536, "bytes past the allowance remain unread");
  assert.equal(res.body, REQUEST_REFUSAL);
  assert.equal(res.writableEnded, true);
  req.destroy();
});

it("a sender that never finishes receives its response immediately and drain ends at the time bound", async () => {
  const req = new PassThrough(); const res = new Reply();
  const started = Date.now();
  const result = refuseCloudRequest(req, res, 413);
  assert.equal(res.body, REQUEST_REFUSAL, "refusal does not wait for an upload to finish");
  assert.equal(res.writableEnded, false);
  // Production has a listening server/socket; this in-memory stream does not.
  // Keep the test alive while the intentionally unref'd drain timer runs.
  const guard = setTimeout(() => req.destroy(new Error("Rejection drain did not finish")), REJECTION_DRAIN_MS + 2000);
  try {
    const evidence = await result;
    assert.equal(evidence.reason, "time-limit");
    assert.equal(evidence.discardedBytes, 0);
    assert.ok(Date.now() - started >= REJECTION_DRAIN_MS - 50);
    assert.ok(Date.now() - started < REJECTION_DRAIN_MS + 2000);
    assert.equal(res.writableEnded, true);
  } finally { clearTimeout(guard); req.destroy(); }
});

it("rejection grace concurrency is capped and rejected requests never reach the application", async () => {
  let dispatched = 0;
  const handler = createCloudRequestHandler(async () => { dispatched++; }, { onAdmission: () => {} });
  const requests = Array.from({ length: MAX_REJECTION_DRAINS + 1 }, () => Object.assign(new PassThrough(), {
    method: "POST", url: "/mods/new", headers: { "content-length": String(MAX_BODY_BYTES + 1) },
  }));
  const responses = requests.map(() => new Reply());
  const pending = requests.map((req, index) => handler(req, responses[index]));
  assert.equal((await pending.at(-1))?.reason, "drain-saturated");
  assert.equal(responses.at(-1)?.writableEnded, true);
  assert.equal(responses.filter(res => !res.writableEnded).length, MAX_REJECTION_DRAINS);
  assert.equal(dispatched, 0);
  for (const req of requests) req.end();
  await Promise.all(pending);
  for (const req of requests) req.destroy();
});

it("actual admission path logs only status, normalized method and numeric length before parser dispatch", async () => {
  const logs: string[] = []; let dispatched = 0;
  const logger = createAdmissionLogger({ writeLine: (line: string) => logs.push(line) });
  const handler = createCloudRequestHandler(async () => { dispatched++; }, { onAdmission: logger });
  for (const [method, length, status] of [
    ["POST", "not-a-number-secret", 400], ["PUT", "0", 405],
    ["POST", undefined, 411], ["POST", String(MAX_BODY_BYTES + 1), 413],
    ["CUSTOM-secret-method", "0", 405],
  ] as const) {
    const req = Object.assign(new PassThrough(), { method, url: "/private-secret-path?token=secret",
      headers: { "content-length": length, authorization: "Bearer secret", cookie: "secret" } });
    const res = new Reply(); const pending = handler(req, res); req.end(); await pending;
    assert.equal(res.status, status); req.destroy();
  }
  assert.equal(dispatched, 0);
  assert.deepEqual(logs.map(line => JSON.parse(line)), [
    { event: "cloud-admission-refused", status: 400, method: "POST", declaredBytes: null },
    { event: "cloud-admission-refused", status: 405, method: "PUT", declaredBytes: 0 },
    { event: "cloud-admission-refused", status: 411, method: "POST", declaredBytes: null },
    { event: "cloud-admission-refused", status: 413, method: "POST", declaredBytes: MAX_BODY_BYTES + 1 },
    { event: "cloud-admission-refused", status: 405, method: "OTHER", declaredBytes: 0 },
  ]);
  assert.ok(logs.every(line => !/secret|authorization|cookie|private/.test(line)));
});

it("admission diagnostics are bounded per minute and mark suppression without changing refusals", () => {
  let time = 0; const logs: string[] = [];
  const logger = createAdmissionLogger({ now: () => time, writeLine: (line: string) => logs.push(line) });
  const req = { method: "POST", headers: { "content-length": "1" } };
  for (let index = 0; index < 100; index++) logger(req, 411);
  assert.equal(logs.length, MAX_ADMISSION_LOGS + 1);
  assert.deepEqual(JSON.parse(logs.at(-1)!), { event: "cloud-admission-logging-limited", windowMs: ADMISSION_LOG_WINDOW_MS, maxEvents: MAX_ADMISSION_LOGS });
  time = ADMISSION_LOG_WINDOW_MS; logger(req, 411);
  assert.equal(logs.length, MAX_ADMISSION_LOGS + 2);
  assert.equal(JSON.parse(logs.at(-1)!).event, "cloud-admission-refused");
});

it("a failed diagnostic sink cannot prevent the existing refusal response", async () => {
  const handler = createCloudRequestHandler(async () => { assert.fail("rejected body reached app"); }, {
    onAdmission: createAdmissionLogger({ writeLine: () => { throw new Error("synthetic logging failure"); } }),
  });
  const req = Object.assign(new PassThrough(), { method: "POST", url: "/", headers: {} });
  const res = new Reply(); const pending = handler(req, res); req.end(); await pending;
  assert.equal(res.status, 411); assert.equal(res.body, REQUEST_REFUSAL); req.destroy();
});
