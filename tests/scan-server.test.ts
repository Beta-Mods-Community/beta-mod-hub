import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, type TestContext } from "node:test";

const fixtureKey = "synthetic-scanner-test-key";

async function startScanner(t: TestContext, host?: string) {
  const sockets = new Set<Socket>();
  let scanCount = 0;
  let scanReply = "stream: OK\0";
  const clamd = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let input = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      input = Buffer.concat([input, chunk]);
      if (input.equals(Buffer.from("zPING\0"))) {
        socket.end("PONG\0");
      } else if (input.subarray(0, 10).equals(Buffer.from("zINSTREAM\0"))
        && input.length >= 14 && input.subarray(-4).equals(Buffer.alloc(4))) {
        scanCount += 1;
        socket.end(scanReply);
      }
    });
  });
  await new Promise<void>((resolve) => clamd.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => clamd.close(() => resolve()));
  });
  const clamdAddress = clamd.address();
  assert.ok(clamdAddress && typeof clamdAddress !== "string");

  const directory = await mkdtemp(path.join(tmpdir(), "betamods-scan-server-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const envFile = path.join(directory, ".env.local");
  await writeFile(envFile, [
    ...(host === undefined ? [] : [`SCAN_SERVER_HOST=${host}`]),
    "SCAN_SERVER_PORT=0",
    "CLAMD_HOST=127.0.0.1",
    `CLAMD_PORT=${clamdAddress.port}`,
    `SCAN_API_KEY=${fixtureKey}`,
  ].join("\n"));

  const child = spawn(process.execPath, [
    `--env-file=${envFile}`, path.resolve("scripts/scan-server.mjs"),
  ], {
    // No inherited service credentials, scanner settings, or Node preloads.
    env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const address = await new Promise<{ host: string; port: number }>((resolve, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => reject(new Error(`Scanner startup timed out: ${stderr}`)), 10_000);
    const onError = (error: Error) => { clearTimeout(timeout); reject(error); };
    const onExit = () => onError(new Error(`Scanner exited before listening: ${stderr}`));
    child.once("error", onError);
    child.once("exit", onExit);
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/scan server listening on ([\d.]+):(\d+) ->/);
      if (!match) return;
      clearTimeout(timeout);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      resolve({ host: match[1], port: Number(match[2]) });
    });
  });
  return { ...address, url: `http://127.0.0.1:${address.port}`, scans: () => scanCount,
    setScanReply: (reply: string) => { scanReply = reply; } };
}

it("local scanner defaults to loopback and loads its authentication key from --env-file", async (t) => {
  const scanner = await startScanner(t);
  assert.equal(scanner.host, "127.0.0.1");

  const health = await fetch(`${scanner.url}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, clamd: "PONG" });

  for (const headers of [new Headers(), new Headers({ authorization: "Bearer wrong-key" })]) {
    const result = await fetch(scanner.url, { method: "POST", headers, body: "synthetic fixture" });
    assert.equal(result.status, 401);
    assert.deepEqual(await result.json(), { clean: false, error: "unauthorized" });
  }
  assert.equal(scanner.scans(), 0, "unauthorized requests must not reach clamd");

  const result = await fetch(scanner.url, {
    method: "POST", headers: { authorization: `Bearer ${fixtureKey}` }, body: "synthetic fixture",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { clean: true });
  assert.equal(scanner.scans(), 1);
});

it("scanner accepts an explicit container-network binding", async (t) => {
  const scanner = await startScanner(t, "0.0.0.0");
  assert.equal(scanner.host, "0.0.0.0");
  const result = await fetch(scanner.url, { method: "POST", body: "synthetic fixture" });
  assert.equal(result.status, 401);
  await result.arrayBuffer();
  assert.equal(scanner.scans(), 0);
});

it("scanner requires one exact clean verdict and never mistakes an OK-prefixed malware name for success", async (t) => {
  const scanner = await startScanner(t);
  const scan = () => fetch(scanner.url, {
    method: "POST", headers: { authorization: `Bearer ${fixtureKey}` }, body: "synthetic fixture",
  });
  scanner.setScanReply("stream: OK.FakeSignature FOUND\0");
  const infected = await scan();
  assert.equal(infected.status, 200);
  assert.deepEqual(await infected.json(), { clean: false, malware: "OK.FakeSignature" });

  for (const reply of ["stream: OK", "stream: OK\n", "stream: OKAY\0", "prefix stream: OK\0", "stream: OK\0stream: Test FOUND\0",
    "stream: OK\nstream: read ERROR\0", "stream: OK\0\0", ""]) {
    scanner.setScanReply(reply);
    const result = await scan();
    assert.equal(result.status, 503, JSON.stringify(reply));
    assert.equal((await result.json()).clean, false);
  }
});
