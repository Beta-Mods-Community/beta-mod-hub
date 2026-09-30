// Used by local-preview.ps1. Secrets stay in this process, never command lines.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { databaseEndpoint, readDevEnvironment, readPrivateEnv } from "./dev-database.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const local = readDevEnvironment(root);
const home = readPrivateEnv(root, ".env.home");
if (home.DATABASE_URL && databaseEndpoint(home.DATABASE_URL) !== databaseEndpoint(local.DATABASE_URL)) {
  throw new Error("The home environment no longer uses the dev database. Preview stopped to protect production.");
}
const config = { ...local, ...home, DATABASE_URL: local.DATABASE_URL };
for (const [key, value] of Object.entries(config)) {
  process.env[key] = value;
}
// Empty strings deliberately prevent Next's later .env.local load from
// restoring setup-only secrets. Also neutralize inherited shell credentials.
for (const key of new Set([...Object.keys(config), ...Object.keys(process.env), "CLOUDFLARE_API_TOKEN"])) {
  if (/BOOTSTRAP|TUNNEL_TOKEN|^CLOUDFLARE_API_TOKEN$/.test(key)) process.env[key] = "";
}
for (const key of ["STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY", "SESSION_SECRET", "SCAN_API_KEY"]) {
  if (!process.env[key]) throw new Error(`Missing ${key}; configure the private preview environment before starting.`);
}
Object.assign(process.env, {
  NODE_ENV: "development", STORAGE_DRIVER: "r2", PILOT_MODE: "on",
  APP_URL: "http://127.0.0.1:3000", AUTH_MAIL_MODE: "preview",
  AUTH_ALLOW_UNVERIFIED_LOCAL: "true", SCAN_ENDPOINT: "http://127.0.0.1:3311",
  SCAN_SERVER_HOST: "127.0.0.1", SCAN_SERVER_PORT: "3311",
  CLAMD_HOST: "127.0.0.1", CLAMD_PORT: "3310",
  MALWARE_SCAN_API_KEY: process.env.SCAN_API_KEY,
});
process.chdir(root);
const service = process.argv[2];
if (service === "scanner") {
  await import("./scan-server.mjs");
} else if (service === "app") {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("next/dist/bin/next");
  process.argv = [process.execPath, entry, "dev", "--hostname", "127.0.0.1", "--port", "3000"];
  await import(pathToFileURL(entry).href);
} else {
  throw new Error("Expected app or scanner.");
}
