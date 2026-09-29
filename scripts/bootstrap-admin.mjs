// Explicit local operator action. Does not infer privilege from an email and
// never changes email verification. Dry-run unless --apply is supplied.
// node scripts/bootstrap-admin.mjs <known-user-uuid> --env-file .env.local [--apply]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const userId = args[0]?.toLowerCase();
if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId)) {
  throw new Error("Supply the known account UUID, not an email address.");
}
const envArg = args.indexOf("--env-file");
const filename = envArg >= 0 ? args[envArg + 1] : ".env.local";
if (![".env.local", ".env.home", ".env.production"].includes(filename)) throw new Error("Choose an existing private environment file.");
const target = path.join(root, filename);
const source = await readFile(target, "utf8");
function env(name) {
  const raw = source.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";
  return raw.replace(/^(["'])(.*)\1$/, "$2");
}
if (!env("DATABASE_URL")) throw new Error("DATABASE_URL is missing.");
const sql = postgres(env("DATABASE_URL"), { max: 1, prepare: false });
try {
  const [user] = await sql`select id, suspended_at from users where id = ${userId}`;
  if (!user || user.suspended_at) throw new Error("That UUID is not an active account in this environment's database.");
  const ids = new Set(env("ADMIN_USER_IDS").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  ids.add(userId);
  if (!args.includes("--apply")) {
    console.log(`Verified account ${userId}. Would add ADMIN_USER_IDS to ${filename}. Re-run with --apply to save.`);
  } else {
    const line = `ADMIN_USER_IDS=${[...ids].join(",")}`;
    const updated = /^ADMIN_USER_IDS=/m.test(source) ? source.replace(/^ADMIN_USER_IDS=.*$/m, line) : `${source.trimEnd()}\n${line}\n`;
    await writeFile(target, updated, { encoding: "utf8", mode: 0o600 });
    console.log(`Added explicit administrator ID to ${filename}. Restart the app to load it. No account data or verification state changed.`);
  }
} finally { await sql.end(); }
