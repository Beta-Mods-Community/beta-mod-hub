// Quick connectivity check for the local dev database.
// Reads DATABASE_URL from .env.local, connects, prints the server version.
//
// Usage: node scripts/check-db.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = readFileSync(path.join(root, ".env.local"), "utf8");
const match = envFile.match(/^DATABASE_URL=(.+)$/m);

if (!match) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const sql = postgres(match[1].trim(), { max: 1 });

try {
  const rows = await sql`select version() as v`;
  console.log("CONNECTED:", rows[0].v);
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}