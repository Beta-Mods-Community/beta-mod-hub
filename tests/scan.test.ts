import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { createServer, type Server } from "node:http";
import { scanUpload } from "../lib/scan";

let server: Server;
let reply: unknown = { clean: true };
let status = 200;
const previousEndpoint = process.env.SCAN_ENDPOINT;

before(async () => {
  server = createServer((request, response) => {
    request.resume();
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(reply));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No scanner fixture port");
  process.env.SCAN_ENDPOINT = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (previousEndpoint === undefined) delete process.env.SCAN_ENDPOINT;
  else process.env.SCAN_ENDPOINT = previousEndpoint;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

it("scanner permits only the boolean clean=true response", async () => {
  reply = { clean: true };
  assert.deepEqual(await scanUpload(new Uint8Array([1])), { ok: true });
  for (const malformed of [{ clean: "false" }, { clean: "true" }, { clean: 1 }, {}, null, [true]]) {
    reply = malformed;
    const result = await scanUpload(new Uint8Array([1]));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unavailable");
  }
});

it("scanner rejects infection and service errors", async () => {
  reply = { clean: false, malware: "Test-Signature" };
  assert.deepEqual(await scanUpload(new Uint8Array([1])), { ok: false, reason: "infected", malware: "Test-Signature" });
  status = 503;
  reply = { clean: true };
  const result = await scanUpload(new Uint8Array([1]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "unavailable");
  status = 200;
});
