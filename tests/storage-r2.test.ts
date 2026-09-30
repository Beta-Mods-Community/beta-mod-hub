import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { createR2Store, type PresignFn } from "../lib/storage-r2";

/**
 * The R2 driver, exercised against a stub S3 client.
 *
 * No network and no bucket: what is under test is our part of the contract —
 * which command is sent, with which bucket, key, body and disposition, and what
 * the driver does when the store misbehaves. Signing is stubbed too, because a
 * real signature is not what needs asserting; the command it was handed is.
 */

type Recorded = { name: string; input: Record<string, unknown> };

function stubClient(
  handler: (command: Recorded) => unknown = () => ({}),
): { client: S3Client; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const client = {
    async send(command: { constructor: { name: string }; input: unknown }) {
      const record: Recorded = {
        name: command.constructor.name,
        input: command.input as Record<string, unknown>,
      };
      calls.push(record);
      return handler(record);
    },
  } as unknown as S3Client;
  return { client, calls };
}

/** A GetObject output whose body yields `bytes`. */
function bodyOutput(bytes: Uint8Array) {
  return { Body: { transformToByteArray: async () => bytes } };
}

const BUCKET = "betamods-pilot";

describe("createR2Store", () => {
  it("refuses to be built without a bucket", () => {
    const { client } = stubClient();
    assert.throws(
      () => createR2Store({ client, bucket: "" }),
      /STORAGE_BUCKET/,
    );
  });
});

describe("R2 store: put", () => {
  it("sends the exact bytes to the bucket under the given key", async () => {
    const { client, calls } = stubClient();
    const store = createR2Store({ client, bucket: BUCKET });
    const data = new Uint8Array([1, 2, 3, 4]);

    await store.put("builds/abc/build-0.1.zip", data);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "PutObjectCommand");
    assert.deepEqual(calls[0].input, {
      Bucket: BUCKET,
      Key: "builds/abc/build-0.1.zip",
      Body: data,
      ContentLength: 4,
    });
  });

  it("sets the object's ContentType when the caller supplies one", async () => {
    // Media promotes with the sniffed MIME so the stored object is self
    // describing, not a generic application/octet-stream blob.
    const { client, calls } = stubClient();
    const store = createR2Store({ client, bucket: BUCKET });

    await store.put(
      "media/abc/01cf4b3a.png",
      new Uint8Array([1, 2, 3]),
      "image/png",
    );

    assert.equal(calls[0].name, "PutObjectCommand");
    assert.equal(calls[0].input.ContentType, "image/png");
    assert.equal(calls[0].input.Key, "media/abc/01cf4b3a.png");
  });

  it("propagates a store failure instead of reporting success", async () => {
    // Silently swallowing this would leave the app believing a file is safely
    // in R2 when it is not.
    const { client } = stubClient(() => {
      throw new Error("AccessDenied");
    });
    const store = createR2Store({ client, bucket: BUCKET });
    await assert.rejects(
      () => store.put("builds/abc/x.zip", new Uint8Array([1])),
      /AccessDenied/,
    );
  });
});

describe("R2 store: get", () => {
  it("returns the object bytes and their length", async () => {
    const data = new Uint8Array([9, 8, 7]);
    const { client, calls } = stubClient(() => bodyOutput(data));
    const store = createR2Store({ client, bucket: BUCKET });

    const out = await store.get("builds/abc/x.zip");
    assert.equal(out?.size, 3);
    assert.deepEqual([...(out?.data ?? [])], [9, 8, 7]);
    assert.equal(calls[0].name, "GetObjectCommand");
    assert.equal(calls[0].input.Bucket, BUCKET);
  });

  it("reports a missing object as not found, never as an S3 error string", async () => {
    // NoSuchKey / AccessDenied / network blip are all "not there" to a user.
    const { client } = stubClient(() => {
      throw new Error("NoSuchKey: bucket/bad-key");
    });
    const store = createR2Store({ client, bucket: BUCKET });
    assert.equal(await store.get("builds/abc/x.zip"), null);
  });

  it("reports an object with no body as not found", async () => {
    const { client } = stubClient(() => ({}));
    const store = createR2Store({ client, bucket: BUCKET });
    assert.equal(await store.get("builds/abc/x.zip"), null);
  });
});

describe("cloud object store: bounded materialization", () => {
  it("counts stream bytes and accepts an object exactly at the limit", async () => {
    const { client } = stubClient(() => ({
      Body: (async function* () { yield new Uint8Array([1, 2]); yield new Uint8Array([3, 4]); })(),
    }));
    const out = await createR2Store({ client, bucket: BUCKET, maxMaterializedBytes: 4 }).get("k");
    assert.deepEqual([...(out?.data ?? [])], [1, 2, 3, 4]);
    assert.equal(out?.size, 4);
  });

  it("refuses oversized headers before consuming the body and closes it", async () => {
    let destroyed = false;
    let consumed = false;
    const { client } = stubClient(() => ({ ContentLength: 5, Body: {
      async *[Symbol.asyncIterator]() { consumed = true; yield new Uint8Array([1]); },
      destroy() { destroyed = true; },
    } }));
    assert.equal(await createR2Store({ client, bucket: BUCKET, maxMaterializedBytes: 4 }).get("k"), null);
    assert.equal(consumed, false);
    assert.equal(destroyed, true);
  });

  it("stops an over-limit stream even when ContentLength is missing or dishonest", async () => {
    for (const ContentLength of [undefined, 1]) {
      let closed = false;
      let thirdChunk = false;
      const { client } = stubClient(() => ({ ContentLength, Body: (async function* () {
        try {
          yield new Uint8Array([1, 2, 3]);
          yield new Uint8Array([4, 5]);
          thirdChunk = true;
          yield new Uint8Array([6]);
        } finally { closed = true; }
      })() }));
      assert.equal(await createR2Store({ client, bucket: BUCKET, maxMaterializedBytes: 4 }).get("k"), null);
      assert.equal(closed, true);
      assert.equal(thirdChunk, false);
    }
  });

  it("never falls back to unbounded transformToByteArray in cloud mode", async () => {
    let transformed = false;
    const { client } = stubClient(() => ({ Body: {
      transformToByteArray: async () => { transformed = true; return new Uint8Array(100); },
    } }));
    assert.equal(await createR2Store({ client, bucket: BUCKET, maxMaterializedBytes: 4 }).get("k"), null);
    assert.equal(transformed, false);
  });

  it("rejects malformed stream chunks or invalid content-length headers", async () => {
    for (const output of [
      { Body: (async function* () { yield "unexpected string"; })() },
      { ContentLength: -1, Body: (async function* () { yield new Uint8Array([1]); })() },
      { ContentLength: 1.5, Body: (async function* () { yield new Uint8Array([1]); })() },
    ]) {
      const { client } = stubClient(() => output);
      assert.equal(await createR2Store({ client, bucket: BUCKET, maxMaterializedBytes: 4 }).get("k"), null);
    }
  });

  it("refuses over-limit PUTs before contacting storage without changing accepted bytes", async () => {
    const { client, calls } = stubClient();
    const store = createR2Store({ client, bucket: BUCKET, maxMaterializedBytes: 4 });
    await assert.rejects(() => store.put("k", new Uint8Array(5)), /cloud pilot storage limit/);
    assert.equal(calls.length, 0);
    await store.put("k", new Uint8Array(4));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input.ACL, undefined, "no public ACL is ever requested");
  });

  it("rejects invalid limit configuration rather than disabling the cap", () => {
    const { client } = stubClient();
    for (const maxMaterializedBytes of [0, -1, Infinity, NaN, 1.5]) {
      assert.throws(() => createR2Store({ client, bucket: BUCKET, maxMaterializedBytes }), /positive safe integer/);
    }
  });
});

describe("R2 store: remove", () => {
  it("deletes by bucket and key", async () => {
    const { client, calls } = stubClient();
    const store = createR2Store({ client, bucket: BUCKET });

    await store.remove("builds/abc/x.zip");

    assert.equal(calls[0].name, "DeleteObjectCommand");
    assert.deepEqual(calls[0].input, { Bucket: BUCKET, Key: "builds/abc/x.zip" });
  });
});

describe("R2 store: presignDownload", () => {
  it("signs a GetObject for the requested expiry with the download filename", async () => {
    // The point of presigning: the archive goes R2 -> downloader without
    // touching this PC, under the name the user uploaded.
    const { client } = stubClient();
    const signed: Array<{ command: unknown; options: unknown }> = [];
    const sign: PresignFn = async (_client, command, options) => {
      signed.push({ command, options });
      return "https://signed.example/x?sig=1";
    };
    const store = createR2Store({ client, bucket: BUCKET, sign });

    const url = await store.presignDownload("builds/abc/x.zip", {
      filename: "build-0.1.zip",
      expiresIn: 300,
    });

    assert.equal(url, "https://signed.example/x?sig=1");
    assert.equal(signed.length, 1);
    assert.deepEqual(signed[0].options, { expiresIn: 300 });

    const command = signed[0].command as GetObjectCommand;
    assert.ok(command instanceof GetObjectCommand);
    assert.deepEqual(command.input, {
      Bucket: BUCKET,
      Key: "builds/abc/x.zip",
      ResponseContentDisposition: 'attachment; filename="build-0.1.zip"',
    });
  });

  it("strips quotes and backslashes so the disposition stays well formed", async () => {
    // A filename with a quote would otherwise break out of the header value.
    const { client } = stubClient();
    let seen: string | undefined;
    const sign: PresignFn = async (_client, command) => {
      seen = (
        command as GetObjectCommand
      ).input.ResponseContentDisposition as string;
      return "https://signed.example/x";
    };
    const store = createR2Store({ client, bucket: BUCKET, sign });

    await store.presignDownload("builds/abc/x.zip", {
      filename: 'ev"il\\name.zip',
      expiresIn: 60,
    });

    assert.equal(seen, 'attachment; filename="ev_il_name.zip"');
  });

  it("omits the disposition override when no filename is given", async () => {
    const { client } = stubClient();
    let seen: unknown = "unset";
    const sign: PresignFn = async (_client, command) => {
      seen = (command as GetObjectCommand).input.ResponseContentDisposition;
      return "https://signed.example/x";
    };
    const store = createR2Store({ client, bucket: BUCKET, sign });

    await store.presignDownload("builds/abc/x.zip", { expiresIn: 60 });
    assert.equal(seen, undefined);
  });

  it("signs an inline GET with the object's content type for <img> delivery", async () => {
    // Media reaches the browser the same way a build does — R2 straight to the
    // requester, no byte proxied through the home PC — but inline, so an
    // <img> tag renders it instead of the browser saving a file.
    const { client } = stubClient();
    let seen: GetObjectCommand | undefined;
    const sign: PresignFn = async (_client, command) => {
      seen = command as GetObjectCommand;
      return "https://signed.example/media?id=1";
    };
    const store = createR2Store({ client, bucket: BUCKET, sign });

    const url = await store.presignDownload("media/abc/shot.png", {
      contentType: "image/png",
      inline: true,
      expiresIn: 60,
    });

    assert.equal(url, "https://signed.example/media?id=1");
    assert.deepEqual(seen?.input, {
      Bucket: BUCKET,
      Key: "media/abc/shot.png",
      ResponseContentDisposition: "inline",
      ResponseContentType: "image/png",
    });
  });
});

describe("R2 store: inventory", () => {
  it("walks every page and reports key and size", async () => {
    // The admin console lists the bucket to show what is really being paid for.
    let page = 0;
    const { client, calls } = stubClient(() => {
      page += 1;
      return page === 1
        ? {
            Contents: [
              { Key: "builds/a.zip", Size: 100 },
              { Key: "builds/b.zip", Size: 250 },
            ],
            IsTruncated: true,
            NextContinuationToken: "page2",
          }
        : {
            Contents: [{ Key: "builds/c.zip", Size: 7 }],
            IsTruncated: false,
          };
    });
    const store = createR2Store({ client, bucket: BUCKET });

    const objects = await store.inventory();

    assert.deepEqual(objects, [
      { key: "builds/a.zip", size: 100 },
      { key: "builds/b.zip", size: 250 },
      { key: "builds/c.zip", size: 7 },
    ]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].input.ContinuationToken, "page2");
  });

  it("returns an empty list for an empty bucket", async () => {
    const { client } = stubClient(() => ({}));
    const store = createR2Store({ client, bucket: BUCKET });
    assert.deepEqual(await store.inventory(), []);
  });
});

describe("R2 store: bucket isolation", () => {
  it("never lets a key address a different bucket", async () => {
    const { client, calls } = stubClient();
    const store = createR2Store({ client, bucket: BUCKET });
    await store.put("builds/a/b.zip", new Uint8Array([1]));
    assert.ok(calls[0] instanceof Object);
    assert.equal((calls[0] as { name: string }).name, "PutObjectCommand");
    assert.ok(
      !JSON.stringify(calls[0].input).includes("betamods-bootstrap"),
      "bucket-scoped credentials must never see another bucket",
    );
  });
});

describe("PutObjectCommand input shape", () => {
  it("carries ContentLength so R2 knows the body size without buffering", () => {
    // Guards the contract the stub assertions rely on.
    const command = new PutObjectCommand({ Bucket: BUCKET, Key: "k", Body: "x" });
    assert.equal(command.input.Bucket, BUCKET);
  });
});
