// End-to-end test of the upload pipeline against a running dev server.
//
// Drives the REAL server action (uploadBuild) over plain HTTP the way a
// no-JS browser would: fetch the mod page HTML, take the upload form's
// $ACTION_* hidden fields verbatim, then multipart-POST to the same URL with
// a session cookie minted from the app's own jose secret.
//
// Checks (fails the run if any fails):
//   1. benign upload -> 303 redirect + builds row inserted
//   2. stored file bytes == fixture bytes (quarantine ended up promoted)
//   3. GET /files/<buildId> serves identical bytes
//   4. EICAR upload -> blocked, no builds row, quarantine left empty
//
// Prereqs: dev server on :3000, clamd + scan-server running (SCAN_ENDPOINT
// set), demo dataset seeded (scripts/seed-demo.mjs).
//
// Usage: node scripts/e2e-upload.mjs
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { SignJWT } from "jose";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envRaw = readFileSync(path.join(root, ".env.local"), "utf8");
const env = (key) => {
  const m = envRaw.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim() : "";
};

const DATABASE_URL = env("DATABASE_URL");
const SESSION_SECRET = env("SESSION_SECRET");
const BASE = "http://localhost:3000";
const DEMO_OWNER_EMAIL = "demo-owner@betamods.test";
const DEMO_MOD_TITLE = "Demo: Emberwood Weapon Pack (Beta)";
const BENIGN_LABEL = "0.1";
const EVIL_LABEL = "0.9-evicar";
const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

if (!DATABASE_URL || !SESSION_SECRET) {
  console.error("DATABASE_URL or SESSION_SECRET missing from .env.local");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function mintSessionCookie(userId) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(SESSION_SECRET));
  return `session=${token}`;
}

/** All hidden-input name/value pairs inside one <form> segment. */
function hiddenFields(formSegment) {
  const fields = [];
  const re = /<input[^>]+type="hidden"[^>]*>/g;
  let m;
  while ((m = re.exec(formSegment)) !== null) {
    const tag = m[0];
    const name = /name="([^"]*)"/.exec(tag)?.[1] ?? "";
    const v = /value="([^"]*)"/.exec(tag)?.[1] ?? "";
    fields.push([
      name,
      v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"),
    ]);
  }
  return fields;
}

/** The <form> segment containing the build file input (name="file"). */
function uploadFormSegment(html) {
  const forms = html.split(/<form\b/i).slice(1);
  return forms.find((seg) => seg.includes('name="file"') || seg.includes('id="build-file"')) ?? null;
}

async function postForm(url, cookie, fields, { filename, bytes, type, versionLabel, changelog }) {
  const fd = new FormData();
  for (const [name, value] of fields) fd.append(name, value);
  fd.append("versionLabel", versionLabel);
  if (changelog) fd.append("changelog", changelog);
  if (filename) fd.append("file", new Blob([bytes], { type }), filename);
  const res = await fetch(url, {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
    redirect: "manual",
  });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, location: res.headers.get("location"), body };
}

try {
  const owner = await sql`select id from users where email = ${DEMO_OWNER_EMAIL} limit 1`;
  const mod = await sql`select id from beta_mods where title = ${DEMO_MOD_TITLE} limit 1`;
  if (!owner[0] || !mod[0]) throw new Error("demo dataset missing — run scripts/seed-demo.mjs first");
  const ownerId = owner[0].id;
  const modId = mod[0].id;
  const modUrl = `${BASE}/mods/${modId}`;

  // Fresh state for repeat runs.
  await sql`delete from builds where beta_mod_id = ${modId} and version_label in (${BENIGN_LABEL}, ${EVIL_LABEL}, '0.1-debug')`;

  const cookie = await mintSessionCookie(ownerId);

  // ---- Fetch the mod page as owner; extract the upload form ------------
  const page = await fetch(modUrl, { headers: { Cookie: cookie } });
  const pageHtml = await page.text();
  check(`mod page fetched (${page.status})`, page.ok);
  const seg = uploadFormSegment(pageHtml);
  if (!seg) {
    throw new Error(
      "upload form not rendered on mod page — is the session cookie recognized as owner?",
    );
  }
  const fields = hiddenFields(seg);
  const hasAction = fields.some(([n]) => n.startsWith("$ACTION_"));
  check(`upload form has $ACTION_* fields`, hasAction, fields.map(([n]) => n).join(", "));

  // ---- 1. Benign upload --------------------------------------------------
  const benignBytes = readFileSync(
    "C:\\Users\\chast\\AppData\\Local\\Temp\\opencode\\e2e-fixtures\\build-0.1-benign.zip",
  );
  const fixtureSha = sha256(benignBytes);
  let benignRes;
  try {
    benignRes = await postForm(modUrl, cookie, fields, {
      filename: "build-0.1-benign.zip",
      bytes: benignBytes,
      type: "application/zip",
      versionLabel: BENIGN_LABEL,
      changelog: "E2E benign build",
    });
  } catch (e) {
    benignRes = { status: -1, location: null, body: Buffer.from(e.message) };
  }
  check(
    "benign upload -> 303 redirect",
    benignRes.status === 303 && benignRes.location === `/mods/${modId}`,
    `status=${benignRes.status} location=${benignRes.location}`,
  );

  const buildRow =
    await sql`select id, file_url from builds where beta_mod_id = ${modId} and version_label = ${BENIGN_LABEL} order by uploaded_at desc limit 1`;
  check("builds row inserted (0.1)", buildRow.length === 1, buildRow[0]?.file_url ?? "none");

  // ---- 2. Bytes at rest === fixture --------------------------------------
  let storedSha = null;
  let storedPath = null;
  if (buildRow[0]) {
    const uploadsDir = path.join(root, "data", "uploads");
    const lastSegment = buildRow[0].file_url.split("/").pop();
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === lastSegment) {
          storedPath = full;
          storedSha = sha256(readFileSync(full));
        }
      }
    };
    walk(uploadsDir);
  }
  check("stored bytes == fixture bytes", storedSha === fixtureSha, `stored ${storedSha?.slice(0, 12) ?? "?"} vs fixture ${fixtureSha.slice(0, 12)}`);
  console.log("stored at:", storedPath);

  // ---- 3. Serve: GET /files/<buildId> ------------------------------------
  if (buildRow[0]) {
    const dl = await fetch(`${BASE}/files/${buildRow[0].id}`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    const dlBytes = Buffer.from(await dl.arrayBuffer());
    check(
      `GET /files/<id> serves fixture bytes (${dl.status})`,
      dl.status === 200 && sha256(dlBytes) === fixtureSha,
      `served ${sha256(dlBytes).slice(0, 12)}`,
    );
  }

  // ---- 4. EICAR upload -> blocked ----------------------------------------
  const evilRes = await postForm(modUrl, cookie, fields, {
    filename: "build-evicar.zip",
    bytes: Buffer.from(EICAR, "latin1"),
    type: "application/zip",
    versionLabel: EVIL_LABEL,
    changelog: "deliberately malicious build",
  });
  const evilRows =
    await sql`select id from builds where beta_mod_id = ${modId} and version_label = ${EVIL_LABEL} limit 1`;
  const quarantined =
    readdirSync(path.join(root, "data", "quarantine")).filter(
      (f) => !f.endsWith(".tmp") && !f.endsWith(".lock"),
    ).length;
  const bodyText = evilRes.body.toString("utf8");
  check("EICAR upload rejected (no 303)", evilRes.status !== 303 || evilRes.location === undefined, `status=${evilRes.status}`);
  check("EICAR upload -> error surfaced in response", /Upload blocked/.test(bodyText), "");
  check("no builds row for EICAR build", evilRows.length === 0);
  check("quarantine empty after both uploads", quarantined === 0, `files=${quarantined}`);
  if (/Upload blocked/.test(bodyText)) {
    const m = bodyText.match(/Upload blocked[^<]*/);
    console.log("blocked message:", m?.[0]?.trim());
  }

  // ---- verify EICAR actually detectable (sanity on the chain) ------------
  const scanProbe = await fetch("http://127.0.0.1:3311/", {
    method: "POST",
    body: Buffer.from(EICAR, "latin1"),
  });
  const probeJson = await scanProbe.json().catch(() => null);
  check(
    "scan server flags EICAR directly",
    probeJson?.clean === false,
    JSON.stringify(probeJson),
  );
} catch (error) {
  console.error("ERROR:", error.message);
  results.push("FAIL  run errored");
} finally {
  await sql.end();
}

console.log("\n--- e2e upload results ---");
for (const line of results) console.log(line);
const failures = results.filter((l) => l.startsWith("FAIL"));
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed.");
}