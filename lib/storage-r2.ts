import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Private S3-compatible storage (R2 or Supabase), with the client and signer injected.
 *
 * Keeping the client injectable is what lets the driver's behaviour be unit
 * tested without a network or a real bucket — see tests/storage-r2.test.ts.
 * Nothing here talks to disk: quarantine is separate, and only scanned final
 * objects reach this store. The existing R2 names remain for compatibility.
 */

/** Real signer. Replaced by a stub in tests. */
export type PresignFn = (
  client: S3Client,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

export type R2StoreOptions = {
  client: S3Client;
  bucket: string;
  sign?: PresignFn;
  /** When set, reads are counted while streaming and writes are bounded. */
  maxMaterializedBytes?: number;
  /** Entire operation deadline, including GET bodies and every inventory page. */
  operationTimeoutMs?: number;
};

export const CLOUD_STORAGE_OPERATION_TIMEOUT_MS = 30_000;
export const CLOUD_STORAGE_CONNECT_TIMEOUT_MS = 5_000;

export type R2Store = {
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  get(key: string): Promise<{ data: Uint8Array; size: number } | null>;
  remove(key: string): Promise<void>;
  /**
   * Short-lived presigned GET. With `filename` the browser is forced to save
   * under that name (attachment); with `inline` the object is served in-place
   * under `contentType`, which is how gallery images reach an <img> tag. The
   * app never proxies either kind of byte.
   */
  presignDownload(
    key: string,
    options: {
      filename?: string;
      contentType?: string;
      inline?: boolean;
      expiresIn: number;
    },
  ): Promise<string>;
  /** Every key/size in the bucket — the admin console's drift check. */
  inventory(): Promise<Array<{ key: string; size: number }>>;
};

/** RFC 6266 disposition, quoted per the grammar. */
function contentDisposition(filename: string): string {
  const safe = filename.replace(/["\\]/g, "_");
  return `attachment; filename="${safe}"`;
}

type BoundedBody = AsyncIterable<Uint8Array> & { destroy?: () => void };

type StorageDeadline = {
  signal: AbortSignal;
  assertActive(): void;
  trackBody(body: unknown): void;
};

/**
 * A deadline must cancel the work, not just stop awaiting it. The signal aborts
 * the SDK's actual HTTP request; destroying a returned Node stream also covers
 * a server that sends headers and then never finishes its body. The rejection
 * races that cancellation only so a broken transport cannot keep a caller's
 * mutation slot forever. Late responses are destroyed before they can be read.
 */
async function withStorageDeadline<T>(
  timeoutMs: number | undefined,
  work: (deadline?: StorageDeadline) => Promise<T>,
): Promise<T> {
  if (timeoutMs === undefined) return work();
  const controller = new AbortController();
  const expiresAt = performance.now() + timeoutMs;
  const error = new Error("Object storage operation timed out");
  let body: BoundedBody | undefined;
  let rejectTimeout!: (reason: Error) => void;
  const expired = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
  const cancel = () => {
    if (controller.signal.aborted) return;
    controller.abort(error);
    try { body?.destroy?.(); } catch { /* Still reject if the transport cleanup fails. */ }
    rejectTimeout(error);
  };
  const assertActive = () => {
    // Also check elapsed time between pages/chunks: immediately resolved
    // promises must not starve the timer and extend an inventory indefinitely.
    if (performance.now() >= expiresAt) cancel();
    if (controller.signal.aborted) throw error;
  };
  const deadline: StorageDeadline = {
    signal: controller.signal,
    assertActive,
    trackBody(value) {
      body = value as BoundedBody;
      // This is a Node server driver. Refuse a non-cancellable body instead of
      // leaving an arbitrary iterator/transform running after its deadline.
      if (typeof body?.destroy !== "function") {
        controller.abort();
        throw new Error("Object storage did not provide a cancellable stream");
      }
      if (controller.signal.aborted) body.destroy();
      assertActive();
    },
  };
  const timer = setTimeout(cancel, timeoutMs);
  try {
    return await Promise.race([work(deadline), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** Never call transformToByteArray on an untrusted-size cloud object. */
async function readBoundedBody(body: unknown, maxBytes: number, deadline?: StorageDeadline): Promise<Uint8Array> {
  const stream = body as BoundedBody;
  if (typeof stream[Symbol.asyncIterator] !== "function") {
    stream.destroy?.();
    throw new Error("Object storage did not provide a bounded-readable stream");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      deadline?.assertActive();
      if (!(chunk instanceof Uint8Array) || chunk.byteLength > maxBytes - total) {
        throw new Error("Stored object exceeds the cloud pilot read limit");
      }
      total += chunk.byteLength;
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  } catch (error) {
    stream.destroy?.();
    throw error;
  }
}

export function createR2Store({
  client,
  bucket,
  sign = getSignedUrl,
  maxMaterializedBytes,
  operationTimeoutMs,
}: R2StoreOptions): R2Store {
  if (!bucket) {
    throw new Error("Object storage requires STORAGE_BUCKET");
  }
  if (maxMaterializedBytes !== undefined && (!Number.isSafeInteger(maxMaterializedBytes) || maxMaterializedBytes <= 0)) {
    throw new Error("Object storage read limit must be a positive safe integer");
  }
  if (operationTimeoutMs !== undefined && (!Number.isSafeInteger(operationTimeoutMs) || operationTimeoutMs <= 0 || operationTimeoutMs > 2_147_483_647)) {
    throw new Error("Object storage timeout must be a positive timer-safe integer");
  }

  return {
    async put(key, data, contentType) {
      if (maxMaterializedBytes !== undefined && data.byteLength > maxMaterializedBytes) {
        throw new Error("Object exceeds the cloud pilot storage limit");
      }
      await withStorageDeadline(operationTimeoutMs, async (deadline) => {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: data,
            ContentLength: data.byteLength,
            ...(contentType ? { ContentType: contentType } : {}),
          }),
          deadline ? { abortSignal: deadline.signal } : undefined,
        );
        deadline?.assertActive();
      });
    },

    async get(key) {
      try {
        return await withStorageDeadline(operationTimeoutMs, async (deadline) => {
          const out = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: key }),
            deadline ? { abortSignal: deadline.signal } : undefined,
          );
          if (out.Body) deadline?.trackBody(out.Body);
          deadline?.assertActive();
          if (!out.Body) return null;
          if (maxMaterializedBytes !== undefined && out.ContentLength !== undefined && (
            !Number.isSafeInteger(out.ContentLength) || out.ContentLength < 0 || out.ContentLength > maxMaterializedBytes
          )) {
            (out.Body as unknown as BoundedBody).destroy?.();
            return null;
          }
          const data = maxMaterializedBytes === undefined
            ? await out.Body.transformToByteArray()
            : await readBoundedBody(out.Body, maxMaterializedBytes, deadline);
          deadline?.assertActive();
          return { data, size: data.byteLength };
        });
      } catch {
        // A missing or unreadable object is "not found" to callers, exactly as
        // the local driver's missing file is. Never surfaces an S3 error string
        // to a user.
        return null;
      }
    },

    async remove(key) {
      // A timeout is uncertain deletion, never success: callers must retain
      // the object's reservation until a later cleanup can confirm removal.
      await withStorageDeadline(operationTimeoutMs, async (deadline) => {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }),
          deadline ? { abortSignal: deadline.signal } : undefined);
        deadline?.assertActive();
      });
    },

    async presignDownload(key, { filename, contentType, inline, expiresIn }) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(inline
          ? {
              ResponseContentDisposition: "inline",
              ...(contentType ? { ResponseContentType: contentType } : {}),
            }
          : filename
            ? { ResponseContentDisposition: contentDisposition(filename) }
            : {}),
      });
      return sign(client, command, { expiresIn });
    },

    async inventory() {
      return withStorageDeadline(operationTimeoutMs, async (deadline) => {
        const objects: Array<{ key: string; size: number }> = [];
        let continuationToken: string | undefined;
        do {
          deadline?.assertActive();
          const page = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              ContinuationToken: continuationToken,
            }),
            deadline ? { abortSignal: deadline.signal } : undefined,
          );
          deadline?.assertActive();
          for (const item of page.Contents ?? []) {
            if (item.Key) objects.push({ key: item.Key, size: Number(item.Size ?? 0) });
          }
          continuationToken = page.IsTruncated
            ? page.NextContinuationToken
            : undefined;
        } while (continuationToken);
        return objects;
      });
    },
  };
}
