import "server-only";

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Storage abstraction over two drivers:
 *   - local (dev): files under ./data (gitignored); used unless STORAGE_DRIVER is r2
 *   - r2 (production): final files live in Cloudflare R2
 *
 * Quarantine is ALWAYS on local disk (server-side temp). Uploads are scanned
 * against the malware scanner before anything is promoted to final storage.
 * Nothing is ever served from the quarantine/upload path — only from the
 * stored location, after a clean scan.
 */

const dataRoot = path.join(process.cwd(), "data");
const quarantineRoot = path.join(dataRoot, "quarantine");
const uploadsRoot = path.join(dataRoot, "uploads");

mkdirSync(quarantineRoot, { recursive: true });
mkdirSync(uploadsRoot, { recursive: true });

const isR2 = process.env.STORAGE_DRIVER === "r2";
const bucket = process.env.STORAGE_BUCKET ?? "";

let s3: S3Client | null = null;
function getS3(): S3Client {
  if (!s3) {
    const endpoint = process.env.STORAGE_ENDPOINT;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.STORAGE_SECRET_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "STORAGE_DRIVER=r2 but STORAGE_ENDPOINT / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY are not all set",
      );
    }
    s3 = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return s3;
}

function quarantinePath(key: string): string {
  return path.join(quarantineRoot, path.basename(key));
}

function storedPath(key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
  return path.join(uploadsRoot, normalized);
}

export function sanitizeFilename(filename: string): string {
  const safe = path
    .basename(filename)
    .replace(/[^\w.\-]/g, "_")
    .slice(0, 120);
  return safe || "upload";
}

/** Builds a storage key like `builds/<id>/<name>` from untrusted user input. */
export function storageKey(prefix: string, filename: string): string {
  return `${prefix}/${sanitizeFilename(filename)}`;
}

// --- Quarantine (always local disk) ---

export function writeQuarantine(data: Uint8Array): string {
  const key = `quarantine/${randomUUID()}`;
  writeFileSync(quarantinePath(key), data);
  return key;
}

export function readQuarantine(key: string): Buffer | null {
  const abs = quarantinePath(key);
  if (!existsSync(abs)) return null;
  return readFileSync(abs);
}

export function deleteQuarantine(key: string): void {
  rmSync(quarantinePath(key), { force: true });
}

/** Move a quarantined (already scanned clean) file into final storage. */
export async function promoteQuarantine(
  key: string,
  finalKey: string,
): Promise<void> {
  const abs = quarantinePath(key);
  if (!existsSync(abs)) {
    throw new Error("quarantine entry missing before promote");
  }
  const data = readFileSync(abs);

  if (isR2) {
    await getS3().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: finalKey,
        Body: data,
        ContentLength: data.length,
      }),
    );
    rmSync(abs, { force: true });
  } else {
    const dest = storedPath(finalKey);
    mkdirSync(path.dirname(dest), { recursive: true });
    renameSync(abs, dest);
  }
}

// --- Stored (final, post-scan) reads/serves ---

export async function readStored(
  finalKey: string,
): Promise<{ data: Uint8Array; size: number } | null> {
  if (isR2) {
    try {
      const out = await getS3().send(
        new GetObjectCommand({ Bucket: bucket, Key: finalKey }),
      );
      if (!out.Body) return null;
      const data = await out.Body.transformToByteArray();
      return { data, size: data.byteLength };
    } catch {
      return null;
    }
  }

  const abs = storedPath(finalKey);
  if (!existsSync(abs)) return null;
  const data = readFileSync(abs);
  return { data, size: data.length };
}

export function deleteStored(finalKey: string): void {
  if (isR2) {
    getS3()
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: finalKey }))
      .catch(() => {});
  } else {
    rmSync(storedPath(finalKey), { force: true });
  }
}