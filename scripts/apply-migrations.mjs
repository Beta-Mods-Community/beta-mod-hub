// Apply db/migrations/*.sql to the database named by .env.local's DATABASE_URL.
//
// Deliberately NOT drizzle-kit: this project treats schema.sql as the canonical
// definition and has no committed drizzle/ folder, and the migrations here are
// written to be re-runnable (guarded CREATE IF NOT EXISTS) so this script can
// be run again on an already-migrated branch without ceremony.
//
// This writes DDL only after verifying .env.local is separate from the known
// production and cloud-pilot database endpoints. Deployment migrations are
// a separate, explicitly authorized operation.
//
// Usage: node scripts/apply-migrations.mjs [--dry-run]
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { readDevEnvironment } from "./dev-database.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dryRun = process.argv.includes("--dry-run");

const DATABASE_URL = readDevEnvironment(root).DATABASE_URL;

const dir = path.join(root, "db", "migrations");
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.log("no migrations to apply");
  process.exit(0);
}

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const info = await sql`select current_database() as db, current_setting('server_version') as version`;
  console.log(`target: ${info[0].db} (PostgreSQL ${info[0].version})`);
  console.log(`mode:   ${dryRun ? "dry run, nothing written" : "applying"}`);

  for (const name of files) {
    const body = readFileSync(path.join(dir, name), "utf8");
    if (dryRun) {
      console.log(`  would apply ${name} (${body.split("\n").length} lines)`);
      continue;
    }
    await sql.unsafe(body);
    console.log(`  applied ${name}`);
  }

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log(`tables: ${tables.map((r) => r.table_name).join(", ")}`);
} finally {
  await sql.end();
}
