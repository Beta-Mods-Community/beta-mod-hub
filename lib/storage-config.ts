import type { S3ClientConfig } from "@aws-sdk/client-s3";

import { isCloudPilot } from "./pilot";

type Env = Record<string, string | undefined>;
export type StorageDriver = "local" | "r2" | "s3";

/** Resolve explicitly; misspellings must not silently store files locally. */
export function readStorageDriver(env: Env = process.env): StorageDriver {
  const driver = env.STORAGE_DRIVER?.trim() || "local";
  if (driver !== "local" && driver !== "r2" && driver !== "s3") {
    throw new Error("STORAGE_DRIVER must be local, r2, or s3");
  }
  return driver;
}

/** Server-only credentials for a private bucket; no anonymous/public fallback. */
export function objectStorageConfig(env: Env = process.env): S3ClientConfig {
  const driver = readStorageDriver(env);
  if (driver === "local") throw new Error("Local storage does not have an S3 configuration");
  if (isCloudPilot(env) && driver !== "s3") {
    throw new Error("CLOUD_PILOT requires STORAGE_DRIVER=s3");
  }
  const endpoint = env.STORAGE_ENDPOINT?.trim();
  const accessKeyId = env.STORAGE_ACCESS_KEY?.trim();
  const secretAccessKey = env.STORAGE_SECRET_KEY?.trim();
  const region = driver === "r2" ? "auto" : env.STORAGE_REGION?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey || !region || !env.STORAGE_BUCKET?.trim()) {
    throw new Error("Object storage requires STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, and STORAGE_REGION for s3");
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("STORAGE_ENDPOINT must be a valid HTTPS endpoint");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("STORAGE_ENDPOINT must be HTTPS without credentials or query parameters");
  }
  if (isCloudPilot(env) && (
    !/^[a-z0-9-]+(?:\.storage)?\.supabase\.co$/.test(url.hostname) ||
    url.port || url.pathname.replace(/\/$/, "") !== "/storage/v1/s3"
  )) {
    throw new Error("CLOUD_PILOT requires the Supabase project's private S3 endpoint");
  }
  return {
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    ...(driver === "s3" ? {
      // Supabase's documented S3 shape; no bucket ACL/public URL is used.
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
      responseChecksumValidation: "WHEN_REQUIRED" as const,
    } : {}),
  };
}
