import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";

export function readPrivateEnv(root, name) {
  try { return parseEnv(readFileSync(path.join(root, name), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

export function databaseEndpoint(value) {
  let url;
  let decodedHost;
  try {
    url = new URL(value);
    decodedHost = decodeURIComponent(url.hostname);
  }
  catch { throw new Error("Invalid database URL in a private environment file. Check its format without printing credentials."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Expected a PostgreSQL URL.");
  // postgres-js accepts failover lists and falls back to PGHOST for hostless
  // URLs. Neither has a single explicit endpoint that this guard can compare.
  if (!url.hostname || decodedHost.includes(",")) {
    throw new Error("Database isolation requires a single explicit hostname; hostless and multi-host URLs are not supported.");
  }
  // A terminal DNS dot names the same host, including a pooled Neon endpoint.
  return url.hostname.toLowerCase().replace(/\.$/, "").replace(/-pooler(?=\.)/, "");
}

export function assertDevDatabase(dev, production) {
  if (!dev || !production) throw new Error("Both dev and production database URLs are required to verify isolation.");
  if (databaseEndpoint(dev) === databaseEndpoint(production)) {
    throw new Error("REFUSING: the dev URL points at the production endpoint (pooled or direct). No changes made.");
  }
}

/**
 * Read dev configuration only after excluding the known deployment endpoints.
 * @param {string} root
 * @returns {Record<string, string | undefined> & { DATABASE_URL: string }}
 */
export function readDevEnvironment(root) {
  const dev = readPrivateEnv(root, ".env.local");
  const production = readPrivateEnv(root, ".env.production");
  const cloud = readPrivateEnv(root, ".env.cloud.local");
  const databaseUrl = dev.DATABASE_URL;
  if (!databaseUrl) throw new Error("Both dev and production database URLs are required to verify isolation.");
  assertDevDatabase(databaseUrl, production.DATABASE_URL);
  if (cloud.DATABASE_URL) assertDevDatabase(databaseUrl, cloud.DATABASE_URL);
  return { ...dev, DATABASE_URL: databaseUrl };
}
