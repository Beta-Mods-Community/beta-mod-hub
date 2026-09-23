#!/usr/bin/env node

/**
 * Production smoke check — run on the Oracle VM (repo directory).
 *
 *   node scripts/smoke-prod.mjs                 # read-only checks
 *   SMOKE_OWNER_EMAIL=owner@betamods.com \
 *     node scripts/smoke-prod.mjs --full        # + real upload pipeline
 *
 * Reads .env.production directly and NEVER prints it or its secrets: the DB
 * check prints only the masked host. Nothing is ever seeded into the
 * production database; the optional --full loop alters it transiently (one
 * builds row + one stored file) and deletes both again in `finally`.
 *
 * Checks:
 *   1. Containers   — app, clamav, caddy running; app + clamav healthy.
 *   2. App/HTTPS    — HTTP 200 on SMOKE_BASE_URL (defaults to the VM-local
 *                     app; set SMOKE_BASE_URL=https://betamods.com post-DNS
 *                     to also exercise Caddy + Let's Encrypt TLS).
 *   3. Database     — SELECT version() against Neon; prints host only.
 *   4. Scan chain   — benign bytes -> clean verdict, EICAR -> flagged.
 *   5. --full       — real HTTP upload (minted session cookie), served bytes
 *                     must match what was stored, EICAR rejected; cleanup.
 *
 * Env (all optional except SMOKE_OWNER_EMAIL for --full):
 *   SMOKE_ENV_FILE          env file to read (default .env.production)
 *   SMOKE_BASE_URL          app base URL (default http://127.0.0.1:3000)
 *   SMOKE_COMPOSE_FILE      compose file for `docker compose` (default compose.oracle.yml)
 *   SMOKE_OWNER_EMAIL       owner whose existing Beta Mod hosts the --full upload
 *   SMOKE_SKIP_CONTAINERS   1 = skip the docker checks (local rehearsal only)
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { SignJWT } from "jose";
import { ZipArchive } from "archiver";

const execFileAsync = promisify(execFile);

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = process.env.SMOKE_ENV_FILE ?? path.join(root, ".env.production");
const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const COMPOSE_FILE = process.env.SMOKE_COMPOSE_FILE ?? "compose.oracle.yml";
const FULL = process.argv.includes("--full");
const SKIP_CONTAINERS = process.env.SMOKE_SKIP_CONTAINERS === "1";
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

const env = (key) => {
  const m = readFileSync(envFile, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim() : "";
};

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
const progress = (msg) => console.log(`· ${msg} ...`);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

if (!env("DATABASE_URL")) {
  console.error(`DATABASE_URL not found in ${envFile} — run this on the Oracle host.`);
  process.exit(1);
}
const sql = postgres(env("DATABASE_URL"), { max: 2 });

/** In-memory benign zip so the fixture never touches the disk on the host. */
async function makeBenignZip() {
  const { Writable } = await import("node:stream");
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const chunks = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  // Attach the completion promise BEFORE finalize so the 'finish' event can't
  // fire before we're listening for it.
  const finished = new Promise((resolve, reject) => {
    sink.on("finish", resolve);
    sink.on("error", reject);
  });
  archive.pipe(sink);
  archive.append(
    `betamods production smoke build ${new Date().toISOString()}\n`,
    { name: "SMOKE.txt" },
  );
  await archive.finalize();
  await finished;
  return Buffer.concat(chunks);
}

/** Masked host from a postgres:// URL — never the credentials. */
function maskedHost(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    return u.hostname + (u.port ? `:${u.port}` : "");
  } catch {
    return "(unparseable url)";
  }
}

async function checkContainers() {
  if (SKIP_CONTAINERS) {
    check("containers (skipped: SMOKE_SKIP_CONTAINERS=1)", true, "local rehearsal");
    return;
  }
  try {
    const { stdout } = await execFileAsync("docker", [
      "compose", "-f", COMPOSE_FILE, "ps", "--format", "json",
    ]);
    const rows = JSON.parse(stdout);
    const byService = Object.fromEntries(rows.map((r) => [r.Service, r]));
    let ok = true;
    for (const svc of ["app", "clamav", "caddy"]) {
      const row = byService[svc];
      const running = row?.State === "running";
      const healthy = svc === "caddy" || row?.Health === "healthy";
      ok &&= running && healthy;
      check(
        `container ${svc} running${svc === "caddy" ? "" : " + healthy"}`,
        running && healthy,
        row ? `state=${row.State} health=${row.Health ?? "n/a"}` : "not found",
      );
    }
  } catch (error) {
    check("containers (docker compose ps)", false, error.message);
  }
}

async function checkAppReadiness() {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(15000) });
    check(`app readiness HTTP ${res.status}`, res.ok, BASE);
  } catch (error) {
    check("app readiness", false, `${BASE} — ${error.message}`);
  }
}

async function checkDatabase() {
  try {
    const rows = await sql`select version() as v`;
    const v = /PostgreSQL (\S+)/.exec(rows[0]?.v ?? "")?.[1] ?? "unknown";
    check("database connectivity", true, `PostgreSQL ${v} @ ${maskedHost(env("DATABASE_URL"))}`);
  } catch (error) {
    check("database connectivity", false, error.message);
  }
}

async function checkScanChain() {
  const endpoint = env("SCAN_ENDPOINT") || "http://127.0.0.1:3311";
  const authHeader = env("MALWARE_SCAN_API_KEY")
    ? { authorization: `Bearer ${env("MALWARE_SCAN_API_KEY")}` }
    : {};
  try {
    const benign = await makeBenignZip();
    const cleanRes = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...authHeader },
      body: benign,
      signal: AbortSignal.timeout(60000),
    });
    const cleanJson = await cleanRes.json().catch(() => null);
    check(
      "scan: benign bytes accepted (clean)",
      cleanRes.ok && cleanJson?.clean === true,
      cleanRes.ok ? JSON.stringify(cleanJson) : `HTTP ${cleanRes.status}`,
    );

    const evilRes = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...authHeader },
      body: Buffer.from(EICAR, "latin1"),
      signal: AbortSignal.timeout(60000),
    });
    const evilJson = await evilRes.json().catch(() => null);
    check(
      "scan: EICAR rejected (flagged)",
      evilRes.ok && evilJson?.clean === false,
      evilRes.ok ? JSON.stringify(evilJson) : `HTTP ${evilRes.status}`,
    );
  } catch (error) {
    check("scan chain", false, error.message);
  }
}

// --- --full: real upload pipeline through the public HTTP form -----------
function hiddenFields(formSegment) {
  const fields = [];
  const re = /<input[^>]+type="hidden"[^>]*>/g;
  let m;
  while ((m = re.exec(formSegment)) !== null) {
    const tag = m[0];
    const name = /name="([^"]*)"/.exec(tag)?.[1] ?? "";
    const v = /value="([^"]*)"/.exec(tag)?.[1] ?? "";
    fields.push([name, v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&")]);
  }
  return fields;
}

async function postForm(url, cookie, fields, { filename, bytes, versionLabel, changelog }) {
  const fd = new FormData();
  for (const [name, value] of fields) fd.append(name, value);
  fd.append("versionLabel", versionLabel);
  if (changelog) fd.append("changelog", changelog);
  fd.append("file", new Blob([bytes], { type: "application/zip" }), filename);
  const res = await fetch(url, {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
    redirect: "manual",
  });
  return {
    status: res.status,
    location: res.headers.get("location"),
    body: await res.text(),
  };
}

async function fullUploadPipeline() {
  const ownerEmail = process.env.SMOKE_OWNER_EMAIL;
  if (!ownerEmail) {
    check("--full upload pipeline (needs SMOKE_OWNER_EMAIL)", true, "skipped");
    return;
  }
  const sessionSecret = env("SESSION_SECRET");
  if (!sessionSecret) {
    check("--full upload pipeline (SESSION_SECRET missing)", false, "set SESSION_SECRET in .env.production");
    return;
  }

  const owner = await sql`select id from users where email = ${ownerEmail} limit 1`;
  if (!owner[0]) {
    check("--full upload pipeline (owner not found)", true, `skipped: no user ${ownerEmail}`);
    return;
  }
  const mod = await sql`
    select id, title from beta_mods where owner_id = ${owner[0].id} limit 1`;
  if (!mod[0]) {
    check("--full upload pipeline (no mod)", true, "skipped: create a Beta Mod in the UI, then rerun with --full");
    return;
  }

  const cookie = `session=${await new SignJWT({ userId: owner[0].id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(sessionSecret))}`;

  const modUrl = `${BASE}/mods/${mod[0].id}`;
  const versionLabel = `smoke-${Date.now()}`;
  let buildId = null;
  let fileUrl = null;

  try {
    const page = await fetch(modUrl, { headers: { Cookie: cookie } });
    const html = await page.text();
    const seg =
      html.split(/<form\b/i).slice(1).find((s) => s.includes('name="file"')) ?? null;
    check("--full: mod page renders upload form", page.ok && !!seg, `mod=${mod[0].title}`);
    if (!seg) {
      check("--full: upload pipeline", false, "upload form not found");
      return;
    }
    const fields = hiddenFields(seg);

    // 1) benign upload -> 303 + stored + served bytes match
    const benign = await makeBenignZip();
    const fixtureSha = sha256(benign);
    const upload = await postForm(modUrl, cookie, fields, {
      filename: "smoke-benign.zip",
      bytes: benign,
      versionLabel,
      changelog: `production smoke check ${versionLabel}`,
    });
    check(
      "--full: benign upload -> 303",
      upload.status === 303 && upload.location === `/mods/${mod[0].id}`,
      `status=${upload.status} location=${upload.location}`,
    );

    const row = await sql`
      select id, file_url from builds
      where beta_mod_id = ${mod[0].id} and version_label = ${versionLabel}
      order by uploaded_at desc limit 1`;
    buildId = row[0]?.id ?? null;
    fileUrl = row[0]?.file_url ?? null;
    check("--full: builds row inserted", !!buildId, buildId ?? "none");

    if (buildId) {
      const dl = await fetch(`${BASE}/files/${buildId}`, {
        headers: { Cookie: cookie },
        redirect: "manual",
      });
      const dlBytes = Buffer.from(await dl.arrayBuffer());
      check(
        "--full: served bytes == stored bytes",
        dl.status === 200 && sha256(dlBytes) === fixtureSha,
        `status=${dl.status}`,
      );
    }

    // 2) EICAR upload -> rejected, no row
    const evil = await postForm(modUrl, cookie, fields, {
      filename: "smoke-evicar.zip",
      bytes: Buffer.from(EICAR, "latin1"),
      versionLabel: `${versionLabel}-evil`,
      changelog: "deliberately malicious smoke check",
    });
    const evilRows = await sql`
      select id from builds
      where beta_mod_id = ${mod[0].id} and version_label = ${`${versionLabel}-evil`}
      limit 1`;
    check(
      "--full: EICAR upload rejected",
      evil.status !== 303 && evilRows.length === 0,
      `status=${evil.status}`,
    );
    check("--full: block message surfaced", /Upload blocked/.test(evil.body), "");
  } catch (error) {
    check("--full: upload pipeline", false, error.message);
  } finally {
    // Restore prior production state: remove the row + the stored file.
    let removedRow = true;
    try {
      if (buildId) await sql`delete from builds where id = ${buildId}`;
    } catch (e) {
      removedRow = false;
      console.error("WARN: could not delete smoke builds row:", e.message);
    }
    let removedFile = true;
    if (fileUrl && removedRow) {
      const localPath = path.join(root, "data", "uploads", fileUrl);
      if (existsSync(localPath)) {
        // Local rehearsal (STORAGE_DRIVER=local on this host).
        try {
          unlinkSync(localPath);
        } catch (e) {
          removedFile = false;
          console.error(`WARN: could not delete ${localPath}:`, e.message);
        }
      } else {
        // On the VM the uploads live in the named Docker volume, not on a
        // host path — remove it inside the container instead.
        try {
          await execFileAsync("docker", [
            "compose", "-f", COMPOSE_FILE, "exec", "-T", "app",
            "sh", "-c", `rm -f '/app/data/uploads/${fileUrl}'`,
          ]);
        } catch (e) {
          removedFile = false;
          console.error(
            `WARN: could not delete stored smoke file ${fileUrl} — remove it manually:`,
            e.message,
          );
        }
      }
    }
    if (buildId || fileUrl) {
      check(
        "--full: cleanup (row+file removed)",
        removedRow && removedFile,
        `row=${removedRow} file=${removedFile}`,
      );
    }
  }
}

try {
  progress("containers");
  await checkContainers();
  progress("app/HTTPS readiness");
  await checkAppReadiness();
  progress("database connectivity");
  await checkDatabase();
  progress("scan chain (benign + EICAR)");
  await checkScanChain();
  if (FULL) {
    progress("full upload pipeline");
    await fullUploadPipeline();
  } else {
    check("--full upload pipeline (read-only run)", true, "skipped — rerun with --full");
  }
} catch (error) {
  console.error("ERROR:", error.message);
  results.push("FAIL  run errored");
} finally {
  await sql.end();
}

console.log("\n--- production smoke results ---");
for (const line of results) console.log(line);
const failures = results.filter((l) => l.startsWith("FAIL"));
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\nAll production smoke checks passed.");
}