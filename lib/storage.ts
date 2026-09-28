import "server-only";

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { S3Client } from "@aws-sdk/client-s3";

import { createR2Store, type R2Store } from "./storage-r2";

/**
 * Storage abstraction over two drivers:
 *   - local (dev + e2e): files under ./data (gitignored)
 *   - r2 (production pilot): final files live in Cloudflare R2
 *
 * Quarantine is ALWAYS on local disk (server-side temp). In production the
 * `app-data` volume is quarantine and nothing else — it is a scratch buffer
 * that is emptied as each upload finishes, never a place a user's mod is
 * kept. Uploads are scanned against the malware scanner before anything is
 * promoted to final storage. Nothing is ever served from the
 * quarantine/upload path — only from the stored location, after a clean scan.
 */

const dataRoot = path.join(process.cwd(), "data");
const quarantineRoot = path.join(dataRoot, "quarantine");
const uploadsRoot = path.join(dataRoot, "uploads");

mkdirSync(quarantineRoot, { recursive: true });
mkdirSync(uploadsRoot, { recursive: true });

const isR2 = process.env.STORAGE_DRIVER === "r2";
const bucket = process.env.STORAGE_BUCKET ?? "";

/** True when final storage is R2, so callers can presign instead of proxying. */
export function usesR2Storage(): boolean {
  return isR2;
}

let r2: R2Store | null = null;
function getR2(): R2Store {
  if (!r2) {
    const endpoint = process.env.STORAGE_ENDPOINT;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.STORAGE_SECRET_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "STORAGE_DRIVER=r2 but STORAGE_ENDPOINT / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY are not all set",
      );
    }
    r2 = createR2Store({
      client: new S3Client({
        region: "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      }),
      bucket,
    });
  }
  return r2;
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

/**
 * Delete quarantined files older than `maxAgeMs`.
 *
 * The happy path removes every quarantine file the moment its upload settles.
 * This exists for the unhappy one: a process killed between the quarantine
 * write and the cleanup would otherwise leave a user's (unscanned) bytes
 * sitting in the volume forever. Called at the start of each upload, so the
 * volume stays a scratch buffer rather than a slow store.
 */
export function sweepStaleQuarantine(maxAgeMs = 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const entry of readdirSync(quarantineRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = path.join(quarantineRoot, entry.name);
    try {
      if (statSync(abs).mtimeMs >= cutoff) continue;
      rmSync(abs, { force: true });
      removed++;
    } catch {
      // Another request reaped it, or it vanished; nothing to do.
    }
  }
  return removed;
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
    // Upload first, then drop the local copy. If the PUT fails the exception
    // propagates, the caller releases the reservation, and the quarantine file
    // is deleted by the caller's error path — so a failed upload never leaves
    // bytes in R2 and never leaves bytes on the PC either.
    await getR2().put(finalKey, data);
    rmSync(abs, { force: true });
  } else {
    const dest = storedPath(finalKey);
    mkdirSync(path.dirname(dest), { recursive: true });
    renameSync(abs, dest);
  }
}

// --- Stored (final, post-scan) reads/serves ---

/**
 * Read a stored object's bytes.
 *
 * Deliberately NOT the download path in production: streaming an archive out
 * of the home PC is exactly what R2 is here to avoid. Callers that serve users
 * should prefer `presignStoredDownload`; this remains for the promotion
 * package, which builds a fresh zip and cannot be handed off as a single URL.
 */
export async function readStored(
  finalKey: string,
): Promise<{ data: Uint8Array; size: number } | null> {
  if (isR2) {
    return getR2().get(finalKey);
  }

  const abs = storedPath(finalKey);
  if (!existsSync(abs)) return null;
  const data = readFileSync(abs);
  return { data, size: data.length };
}

/**
 * A short-lived presigned R2 GET URL, so the archive travels from R2 straight
 * to the downloader instead of through this PC's home connection.
 *
 * Returns null on the local driver, where there is nothing to presign and the
 * caller must stream instead. Throws if signing fails — signing is local
 * crypto, so a failure here is a configuration fault worth surfacing rather
 * than silently falling back to proxying the bytes.
 */
export async function presignStoredDownload(
  finalKey: string,
  options: { filename?: string; expiresIn: number },
): Promise<string | null> {
  if (!isR2) return null;
  return getR2().presignDownload(finalKey, options);
}

export async function deleteStored(finalKey: string): Promise<void> {
  if (isR2) {
    await getR2().remove(finalKey);
    return;
  }
  rmSync(storedPath(finalKey), { force: true });
}

/** Key/size of everything in final storage — used to detect ledger drift. */
export async function storedObjectInventory(): Promise<
  Array<{ key: string; size: number }>
> {
  return isR2 ? getR2().inventory() : [];
}
