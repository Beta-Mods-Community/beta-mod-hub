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
 * The R2 half of storage, with the S3 client and the URL signer injected.
 *
 * Keeping the client injectable is what lets the driver's behaviour be unit
 * tested without a network or a real bucket — see tests/storage-r2.test.ts.
 * Nothing here talks to the local disk: quarantine is local, final storage is
 * R2, and the two are never mixed.
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
};

export type R2Store = {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<{ data: Uint8Array; size: number } | null>;
  remove(key: string): Promise<void>;
  /**
   * Short-lived presigned GET. `filename` is enforced through
   * ResponseContentDisposition so the browser saves it under the original
   * name without the app ever proxying the bytes.
   */
  presignDownload(
    key: string,
    options: { filename?: string; expiresIn: number },
  ): Promise<string>;
  /** Every key/size in the bucket — the admin console's drift check. */
  inventory(): Promise<Array<{ key: string; size: number }>>;
};

/** RFC 6266 disposition, quoted per the grammar. */
function contentDisposition(filename: string): string {
  const safe = filename.replace(/["\\]/g, "_");
  return `attachment; filename="${safe}"`;
}

export function createR2Store({
  client,
  bucket,
  sign = getSignedUrl,
}: R2StoreOptions): R2Store {
  if (!bucket) {
    throw new Error("STORAGE_DRIVER=r2 but STORAGE_BUCKET is not set");
  }

  return {
    async put(key, data) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentLength: data.byteLength,
        }),
      );
    },

    async get(key) {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!out.Body) return null;
        const data = await out.Body.transformToByteArray();
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

    async presignDownload(key, { filename, expiresIn }) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(filename ? { ResponseContentDisposition: contentDisposition(filename) } : {}),
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
