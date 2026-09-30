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

import { CLOUD_STORAGE_CONNECT_TIMEOUT_MS, CLOUD_STORAGE_OPERATION_TIMEOUT_MS, createR2Store, type R2Store } from "./storage-r2";
import { CLOUD_PILOT_READ_LIMIT_BYTES, isCloudPilot } from "./pilot";
import { objectStorageConfig, readStorageDriver } from "./storage-config";

/**
 * Storage abstraction over three drivers:
 *   - local (dev + e2e): files under ./data (gitignored)
 *   - r2 (production pilot): final files live in Cloudflare R2
 *   - s3 (cloud-only pilot): final files live in a private Supabase bucket
 *
 * Quarantine is ALWAYS private server-side scratch (ephemeral on the cloud
 * pilot, the `app-data` volume on Compose targets). It is emptied as each
 * upload finishes, never used as permanent object storage. Uploads are scanned
 * against the malware scanner before anything is
 * promoted to final storage. Nothing is ever served from the
 * quarantine/upload path — only from the stored location, after a clean scan.
 */

const dataRoot = path.join(process.cwd(), "data");
const quarantineRoot = path.join(dataRoot, "quarantine");
const uploadsRoot = path.join(dataRoot, "uploads");

mkdirSync(quarantineRoot, { recursive: true });
mkdirSync(uploadsRoot, { recursive: true });

const driver = readStorageDriver();
const isObjectStorage = driver === "r2" || driver === "s3";
const maxMaterializedBytes = isCloudPilot() ? CLOUD_PILOT_READ_LIMIT_BYTES : undefined;
const bucket = process.env.STORAGE_BUCKET ?? "";

/** True for either private object-store driver, so routes presign, never proxy. */
export function usesObjectStorage(): boolean {
  return isObjectStorage;
}

/** Backwards-compatible route API; includes the S3-compatible cloud driver. */
export function usesR2Storage(): boolean {
  return usesObjectStorage();
}

let r2: R2Store | null = null;
function getR2(): R2Store {
  if (!r2) {
    r2 = createR2Store({
      client: new S3Client({
        ...objectStorageConfig(),
        ...(isCloudPilot() ? {
          // The outer deadline also covers SDK/body processing and pagination;
          // transport timeouts close stalled sockets, with no retry extension.
          maxAttempts: 1,
          requestHandler: {
            connectionTimeout: CLOUD_STORAGE_CONNECT_TIMEOUT_MS,
            requestTimeout: CLOUD_STORAGE_OPERATION_TIMEOUT_MS,
            throwOnRequestTimeout: true,
          },
        } : {}),
      }),
      bucket,
      maxMaterializedBytes,
      operationTimeoutMs: isCloudPilot() ? CLOUD_STORAGE_OPERATION_TIMEOUT_MS : undefined,
    });
  }
  return r2;
}

function assertCloudStorage(): void {
  if (isCloudPilot() && driver !== "s3") {
    throw new Error("CLOUD_PILOT requires private STORAGE_DRIVER=s3 storage");
  }
}

function assertMaterializationSize(size: number): void {
  if (maxMaterializedBytes !== undefined && size > maxMaterializedBytes) {
    throw new Error("File exceeds the cloud pilot memory limit");
  }
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
  assertCloudStorage();
  assertMaterializationSize(data.byteLength);
  const key = `quarantine/${randomUUID()}`;
  writeFileSync(quarantinePath(key), data);
  return key;
}

export function readQuarantine(key: string): Buffer | null {
  const abs = quarantinePath(key);
  if (!existsSync(abs)) return null;
  assertMaterializationSize(statSync(abs).size);
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
  options?: { contentType?: string },
): Promise<void> {
  const abs = quarantinePath(key);
  if (!existsSync(abs)) {
    throw new Error("quarantine entry missing before promote");
  }
  assertCloudStorage();
  assertMaterializationSize(statSync(abs).size);
  const data = readFileSync(abs);

  if (isObjectStorage) {
    // Upload first, then drop the local copy. A failed PUT propagates so the
    // caller can clean quarantine and attempt remote cleanup. An unacknowledged
    // PUT remains charged even if DELETE succeeds: it might finish remotely
    // after that cleanup. Later publication failures likewise retain the charge
    // when removal cannot be confirmed.
    await getR2().put(finalKey, data, options?.contentType);
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
 * Deliberately NOT the object-store download path: archive bytes travel from
 * private object storage straight to the requester. Callers that serve users
 * should prefer `presignStoredDownload`; this remains for the promotion
 * package, which builds a fresh zip and cannot be handed off as a single URL.
 */
export async function readStored(
  finalKey: string,
): Promise<{ data: Uint8Array; size: number } | null> {
  assertCloudStorage();
  if (isObjectStorage) {
    return getR2().get(finalKey);
  }

  const abs = storedPath(finalKey);
  if (!existsSync(abs)) return null;
  assertMaterializationSize(statSync(abs).size);
  const data = readFileSync(abs);
  return { data, size: data.length };
}

/**
 * A short-lived presigned private GET URL, so bytes travel from object storage
 * straight to the requester instead of through the application server.
 *
 * Builds presign with { filename } (attachment download). Media presigns with
 * { inline, contentType } so gallery images render inside an <img> tag.
 *
 * Returns null on the local driver, where there is nothing to presign and the
 * caller must stream instead. Throws if signing fails — signing is local
 * crypto, so a failure here is a configuration fault worth surfacing rather
 * than silently falling back to proxying the bytes.
 */
export async function presignStoredDownload(
  finalKey: string,
  options: {
    filename?: string;
    contentType?: string;
    inline?: boolean;
    expiresIn: number;
  },
): Promise<string | null> {
  assertCloudStorage();
  if (!isObjectStorage) return null;
  return getR2().presignDownload(finalKey, options);
}

export async function deleteStored(finalKey: string): Promise<void> {
  assertCloudStorage();
  if (isObjectStorage) {
    await getR2().remove(finalKey);
    return;
  }
  rmSync(storedPath(finalKey), { force: true });
}

/** Key/size of everything in final storage — used to detect ledger drift. */
export async function storedObjectInventory(): Promise<
  Array<{ key: string; size: number }>
> {
  assertCloudStorage();
  return isObjectStorage ? getR2().inventory() : [];
}
