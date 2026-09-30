import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PassThrough, Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { describe, it } from "node:test";
import type { S3Client } from "@aws-sdk/client-s3";
import { createR2Store, CLOUD_STORAGE_CONNECT_TIMEOUT_MS, CLOUD_STORAGE_OPERATION_TIMEOUT_MS } from "../lib/storage-r2";

type Command = { constructor: { name: string }; input: Record<string, unknown> };
type SendOptions = { abortSignal?: AbortSignal };
function clientWith(send: (command: Command, options?: SendOptions) => Promise<unknown>): S3Client {
  return { send } as unknown as S3Client;
}
function cloudStore(client: S3Client, operationTimeoutMs = 20) {
  return createR2Store({ client, bucket: "private-test", maxMaterializedBytes: 8, operationTimeoutMs });
}

describe("cloud S3 wall-clock deadlines (no external connections)", () => {
  for (const operation of ["put", "get", "remove", "inventory"] as const) {
    it(`aborts a stalled ${operation} request instead of merely abandoning its promise`, { timeout: 2000 }, async () => {
      let aborted = false;
      let signal: AbortSignal | undefined;
      const client = clientWith(async (_command, options) => {
        signal = options?.abortSignal;
        assert.ok(signal, "The actual SDK send must receive the cancellation signal");
        return new Promise((_resolve, reject) => {
          signal!.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("Underlying transport cancelled"));
          }, { once: true });
        });
      });
      const store = cloudStore(client);
      if (operation === "get") assert.equal(await store.get("k"), null);
      else if (operation === "put") await assert.rejects(store.put("k", new Uint8Array([1])), /timed out|cancelled/);
      else if (operation === "remove") await assert.rejects(store.remove("k"), /timed out|cancelled/);
      else await assert.rejects(store.inventory(), /timed out|cancelled/);
      assert.equal(aborted, true);
      assert.equal(signal?.aborted, true);
    });
  }

  it("destroys a stalled GET body after successful headers, retaining the same request deadline", { timeout: 2000 }, async () => {
    const body = new PassThrough();
    body.write(Buffer.from([1])); // One chunk, then no EOF.
    let signal: AbortSignal | undefined;
    const client = clientWith(async (_command, options) => {
      signal = options?.abortSignal;
      return { Body: body, ContentLength: 2 };
    });
    assert.equal(await cloudStore(client).get("k"), null);
    assert.equal(signal?.aborted, true);
    assert.equal(body.destroyed, true, "Cancelling a header request alone does not close its response body");
    await delay(0); // Let the destroyed stream's iterator reject, with no orphan rejection.
  });

  it("destroys a body arriving after timeout without starting consumption", { timeout: 2000 }, async () => {
    let finishSend!: (value: unknown) => void;
    let signal: AbortSignal | undefined;
    const client = clientWith(async (_command, options) => {
      signal = options?.abortSignal;
      // Deliberately faulty test transport that ignores the cancellation signal.
      return new Promise(resolve => { finishSend = resolve; });
    });
    assert.equal(await cloudStore(client).get("k"), null);
    assert.equal(signal?.aborted, true);
    let consumed = false;
    const body = new PassThrough();
    body.on("data", () => { consumed = true; });
    finishSend({ Body: body, ContentLength: 1 });
    await delay(0);
    assert.equal(body.destroyed, true);
    assert.equal(consumed, false);
  });

  it("refuses a body that cannot be cancelled instead of starting its unbounded read", async () => {
    let consumed = false;
    let signal: AbortSignal | undefined;
    const client = clientWith(async (_command, options) => {
      signal = options?.abortSignal;
      return { Body: { async *[Symbol.asyncIterator]() { consumed = true; yield new Uint8Array([1]); } } };
    });
    assert.equal(await cloudStore(client).get("k"), null);
    assert.equal(consumed, false);
    assert.equal(signal?.aborted, true);
  });

  it("uses one signal/deadline across inventory pages and never returns a partial inventory", { timeout: 2000 }, async () => {
    let pages = 0;
    const signals: Array<AbortSignal | undefined> = [];
    const client = clientWith(async (_command, options) => {
      pages++;
      signals.push(options?.abortSignal);
      if (pages === 1) return { Contents: [{ Key: "one", Size: 1 }], IsTruncated: true, NextContinuationToken: "page-2" };
      return new Promise((_resolve, reject) => {
        options?.abortSignal?.addEventListener("abort", () => reject(new Error("Request cancelled")), { once: true });
      });
    });
    await assert.rejects(cloudStore(client).inventory(), /timed out|cancelled/);
    assert.equal(pages, 2);
    assert.ok(signals[0]);
    assert.equal(signals[1], signals[0]);
    assert.equal(signals[1]?.aborted, true);
  });

  it("bounds a continuously resolving inventory even if microtasks starve the timeout callback", { timeout: 2000 }, async () => {
    let pages = 0;
    let signal: AbortSignal | undefined;
    const client = clientWith(async (_command, options) => {
      signal = options?.abortSignal;
      return { IsTruncated: true, NextContinuationToken: `page-${++pages}` };
    });
    await assert.rejects(cloudStore(client).inventory(), /timed out/);
    assert.ok(pages > 0);
    assert.equal(signal?.aborted, true);
  });

  it("clears completed operation deadlines and still reads an exact-limit object", { timeout: 2000 }, async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const client = clientWith(async (command, options) => {
      signals.push(options?.abortSignal);
      if (command.constructor.name === "GetObjectCommand") return { Body: Readable.from([Buffer.alloc(8)]), ContentLength: 8 };
      return {};
    });
    const store = cloudStore(client);
    await store.put("k", new Uint8Array([1]));
    assert.equal((await store.get("k"))?.size, 8);
    await store.remove("k");
    assert.deepEqual(await store.inventory(), []);
    await delay(40);
    assert.equal(signals.length, 4);
    assert.ok(signals.every(signal => signal && !signal.aborted));
  });

  it("keeps noncloud operations free of injected deadlines or cancellation requirements", async () => {
    let options: SendOptions | undefined;
    const client = clientWith(async (_command, sentOptions) => {
      options = sentOptions;
      return { Body: { transformToByteArray: async () => new Uint8Array([1]) } };
    });
    const store = createR2Store({ client, bucket: "legacy-private" });
    assert.equal((await store.get("k"))?.size, 1);
    assert.equal(options, undefined);
  });

  it("rejects invalid deadlines instead of disabling them or overflowing Node timers", () => {
    const client = clientWith(async () => ({}));
    for (const operationTimeoutMs of [0, -1, NaN, Infinity, 1.5, 2_147_483_648]) {
      assert.throws(() => cloudStore(client, operationTimeoutMs), /positive timer-safe integer/);
    }
  });

  it("wires bounded requests and one attempt only into the cloud client factory", () => {
    const source = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
    assert.equal(CLOUD_STORAGE_CONNECT_TIMEOUT_MS, 5000);
    assert.equal(CLOUD_STORAGE_OPERATION_TIMEOUT_MS, 30000);
    assert.match(source, /isCloudPilot\(\)\s*\?\s*\{[\s\S]*?maxAttempts:\s*1/);
    assert.match(source, /connectionTimeout:\s*CLOUD_STORAGE_CONNECT_TIMEOUT_MS/);
    assert.match(source, /requestTimeout:\s*CLOUD_STORAGE_OPERATION_TIMEOUT_MS/);
    assert.match(source, /throwOnRequestTimeout:\s*true/);
    assert.match(source, /operationTimeoutMs:\s*isCloudPilot\(\)\s*\?\s*CLOUD_STORAGE_OPERATION_TIMEOUT_MS\s*:\s*undefined/);
  });
});
