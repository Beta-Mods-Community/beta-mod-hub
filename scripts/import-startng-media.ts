/** One-time import of the two explicitly authorized Start NG images.
 * Run after dev migrations and the real scanner are running:
 * node --conditions=react-server --import tsx scripts/import-startng-media.ts
 * Prints metadata only. Never mutates env files, bypasses scanning or connects
 * to the production database. Re-runs skip the same import captions.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";

const root = path.join(import.meta.dirname, "..");
const modId = "ae142c13-0443-4f6e-9195-e8db52cff7fa";
const ownerId = "4ec5cb11-fbae-49e1-8d64-dd0c001152b8";
const assets = "C:\\Users\\chast\\OneDrive\\Research\\Coding\\mods\\Start NG\\assets\\backgrounds";

async function envFile(filename: string): Promise<Record<string, string>> {
  try {
    return Object.fromEntries((await readFile(path.join(root, filename), "utf8")).split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) return [];
      return [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]];
    }));
  } catch { return {}; }
}
function endpoint(raw: string | undefined) {
  try { const url = new URL(raw ?? ""); return `${url.hostname.replace("-pooler", "")}${url.pathname}`; }
  catch { return ""; }
}

async function main() {
  const [local, home, production] = await Promise.all([envFile(".env.local"), envFile(".env.home"), envFile(".env.production")]);
  const config = { ...local, ...home };
  if (!endpoint(local.DATABASE_URL) || !endpoint(production.DATABASE_URL) ||
      endpoint(config.DATABASE_URL) !== endpoint(local.DATABASE_URL) ||
      endpoint(config.DATABASE_URL) === endpoint(production.DATABASE_URL)) {
    throw new Error("Import stopped: the preview database is not a verified separate dev endpoint.");
  }
  // Same local-preview configuration as the native launcher, with an explicit
  // allowlist that excludes the Cloudflare bootstrap credential entirely.
  const names = ["DATABASE_URL", "STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY",
    "PILOT_MAX_ARCHIVE_BYTES", "PILOT_MAX_BYTES_PER_TESTER", "PILOT_MAX_TOTAL_BYTES", "PILOT_UPLOADS_PER_WINDOW", "PILOT_UPLOAD_WINDOW_MINUTES"];
  for (const name of names) if (config[name]) process.env[name] = config[name];
  process.env.STORAGE_DRIVER = "r2";
  process.env.PILOT_MODE = "on";
  process.env.SCAN_ENDPOINT = "http://127.0.0.1:3311";
  process.env.MALWARE_SCAN_API_KEY = config.SCAN_API_KEY || config.MALWARE_SCAN_API_KEY || "";
  const health = await fetch("http://127.0.0.1:3311/healthz", { signal: AbortSignal.timeout(10000) });
  if (!health.ok) throw new Error("Import stopped: the ClamAV-backed scanner is not healthy.");

  const { db, client } = await import("../lib/db");
  const { betaMods } = await import("../db/schema");
  const { getModMedia, uploadModMediaForUser } = await import("../lib/media-service");
  if (!db) throw new Error("The dev database could not be opened.");
  try {
    const [mod] = await db.select({ ownerId: betaMods.ownerId }).from(betaMods).where(eq(betaMods.id, modId));
    if (mod?.ownerId !== ownerId) throw new Error("Import stopped: Start NG ownership does not match the authorized account.");
    for (const [filename, caption] of [["Dragon.png", "Start NG — Dragon background"], ["Friends.png", "Start NG — Friends background"]]) {
      const existing = await getModMedia(modId);
      const duplicate = existing.find((image) => image.caption === caption);
      if (duplicate) {
        console.log(`Already imported: ${filename} (${duplicate.id})`);
        continue;
      }
      const bytes = await readFile(path.join(assets, filename));
      const id = await uploadModMediaForUser({ userId: ownerId, modId, file: new File([bytes], filename, { type: "image/png" }), caption });
      console.log(`Imported and scanned: ${filename} (${id})`);
    }
    const media = await getModMedia(modId);
    console.log(`Start NG gallery: ${media.length} images, ${media.reduce((total, image) => total + image.sizeBytes, 0)} stored bytes.`);
    if (process.argv.includes("--verify-http")) {
      for (const image of media) {
        const redirect = await fetch(`http://127.0.0.1:3000/media/${image.id}`, { redirect: "manual", signal: AbortSignal.timeout(20000) });
        const location = redirect.headers.get("location");
        if (redirect.status !== 302 || !location) throw new Error("The image route did not redirect to R2.");
        const object = await fetch(location, { signal: AbortSignal.timeout(20000) });
        const bytes = new Uint8Array(await object.arrayBuffer());
        if (!object.ok || object.headers.get("content-type") !== image.mimeType || bytes.byteLength !== image.sizeBytes ||
            !object.headers.get("content-disposition")?.startsWith("inline")) {
          throw new Error("The image did not arrive intact with inline content headers.");
        }
        console.log(`HTTP delivery verified: ${image.id} (${bytes.byteLength} bytes, private R2 redirect).`);
      }
    }
  } finally { await client?.end(); }
}

main().catch(() => {
  console.error("Start NG media import failed. Check dev endpoint separation, scanner health, owner approval, quota and the two source files. No credentials were printed.");
  process.exitCode = 1;
});
