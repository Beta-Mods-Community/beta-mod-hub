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
};

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

/** Never call transformToByteArray on an untrusted-size cloud object. */
async function readBoundedBody(body: unknown, maxBytes: number): Promise<Uint8Array> {
  const stream = body as BoundedBody;
  if (typeof stream[Symbol.asyncIterator] !== "function") {
    stream.destroy?.();
    throw new Error("Object storage did not provide a bounded-readable stream");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
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
}: R2StoreOptions): R2Store {
  if (!bucket) {
    throw new Error("Object storage requires STORAGE_BUCKET");
  }
  if (maxMaterializedBytes !== undefined && (!Number.isSafeInteger(maxMaterializedBytes) || maxMaterializedBytes <= 0)) {
    throw new Error("Object storage read limit must be a positive safe integer");
  }

  return {
    async put(key, data, contentType) {
      if (maxMaterializedBytes !== undefined && data.byteLength > maxMaterializedBytes) {
        throw new Error("Object exceeds the cloud pilot storage limit");
      }
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentLength: data.byteLength,
          ...(contentType ? { ContentType: contentType } : {}),
        }),
      );
    },

    async get(key) {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!out.Body) return null;
        if (maxMaterializedBytes !== undefined && out.ContentLength !== undefined && (
          !Number.isSafeInteger(out.ContentLength) || out.ContentLength < 0 || out.ContentLength > maxMaterializedBytes
        )) {
          (out.Body as unknown as BoundedBody).destroy?.();
          return null;
        }
        const data = maxMaterializedBytes === undefined
          ? await out.Body.transformToByteArray()
          : await readBoundedBody(out.Body, maxMaterializedBytes);
        return { data, size: data.byteLength };
      } catch {
        // A missing or unreadable object is "not found" to callers, exactly as
        // the local driver's missing file is. Never surfaces an S3 error string
        // to a user.
        return null;
      }
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
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
      const objects: Array<{ key: string; size: number }> = [];
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken,
          }),
        );
        for (const item of page.Contents ?? []) {
          if (item.Key) objects.push({ key: item.Key, size: Number(item.Size ?? 0) });
        }
        continuationToken = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
      } while (continuationToken);
      return objects;
    },
  };
}
