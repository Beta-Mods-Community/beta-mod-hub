import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";

export function readPrivateEnv(root, name) {
  try { return parseEnv(readFileSync(path.join(root, name), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

export function databaseEndpoint(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error("Invalid database URL in a private environment file. Check its format without printing credentials."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Expected a PostgreSQL URL.");
  return url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
}

export function assertDevDatabase(dev, production) {
  if (!dev || !production) throw new Error("Both dev and production database URLs are required to verify isolation.");
  if (databaseEndpoint(dev) === databaseEndpoint(production)) {
    throw new Error("REFUSING: the dev URL points at the production endpoint (pooled or direct). No changes made.");
  }
}
