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
//      — walks ./data/uploads (local driver) or fetches from R2 (r2 driver)
//   3. GET /files/<buildId> serves identical bytes
//   4. EICAR upload -> blocked, no builds row, quarantine left empty
//   5. the storage ledger: the good upload is `stored`, the blocked one is
//      `released`, and nothing is left `held` (a leaked reservation would
//      permanently eat the pilot's storage budget)
//   6. with STORAGE_DRIVER=r2: GET /files/<buildId> is a 302 to a SHORT-lived
//      presigned R2 URL, that URL really serves the bytes, an unknown build is
//      a plain 404 with no redirect, and no quarantined bytes are left on disk
//   7. the admin kill switch: with uploads paused even an APPROVED owner gets
//      no form and their POST is refused
//   8. with PILOT_MODE=on: an unapproved account gets no form AND its POST is
//      refused; approving restores the form; revoking takes it away again
//
// Driver awareness: storage is "local" unless STORAGE_DRIVER=r2 in .env.local.
// The quarantine always lives on local disk, so the EICAR checks are driver-free.
// The default local dev run is a good regression test for the pipeline and the
// ledger; run it once with STORAGE_DRIVER=r2 as well, because presigned
// downloads and R2 cleanup are only exercised on that path, and once with
// PILOT_MODE=on, because the allowlist gate is skipped otherwise.
//
// This script flips pilot_accounts and the uploads_enabled switch to exercise
// them, and puts both back. Point it at the DEV database, not production.
//
// Prereqs: dev server on :3000, clamd + scan-server running (SCAN_ENDPOINT
// set), demo dataset seeded (scripts/seed-demo.mjs).
//
// Usage: node scripts/e2e-upload.mjs
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import os from "node:os";
import { ZipArchive } from "archiver";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { SignJWT } from "jose";
import { readDevEnvironment, readPrivateEnv } from "./dev-database.mjs";
import { captureUploadTestState, expectedUploadCheckCount, restoreUploadTestState } from "./e2e-upload-state.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = process.env.E2E_ENV_FILE || ".env.local";
if (envFile !== ".env.local") {
  throw new Error("e2e-upload is a destructive dev-only suite: E2E_ENV_FILE must be .env.local.");
}
const localEnv = readDevEnvironment(root);
const env = (key) => localEnv[key] || "";

const DATABASE_URL = env("DATABASE_URL");
const SESSION_SECRET = env("SESSION_SECRET");
const STORAGE_DRIVER =
  process.env.E2E_STORAGE_DRIVER || env("STORAGE_DRIVER") || "local";
const PILOT_MODE = (env("PILOT_MODE") || "off").toLowerCase() === "on";
const expectedChecks = expectedUploadCheckCount(STORAGE_DRIVER, PILOT_MODE);
// The scan-server the app talks to was launched by local-service.mjs, which
// merges .env.home OVER .env.local. The direct scan probe below must carry
// that same key; otherwise the running scanner answers `unauthorized`. (The
// app-side EICAR path is unaffected — it sends MALWARE_SCAN_API_KEY from the
// same merged process env.)
const homeEnv = readPrivateEnv(root, ".env.home");
const SCAN_API_KEY = homeEnv.SCAN_API_KEY || env("SCAN_API_KEY") || "";
const BASE = "http://127.0.0.1:3000";
const DEMO_OWNER_EMAIL = "demo-owner@betamods.test";
const DEMO_MOD_TITLE = "Demo: Emberwood Weapon Pack (Beta)";
// Keep the fixture version distinct from seed-demo's real "0.1" build. Bug
// reports and verdicts are build-scoped, so deleting the seeded build during
// reset would correctly violate its feedback foreign keys.
const BENIGN_LABEL = "e2e-0.1";
const EVIL_LABEL = "0.9-evicar";
const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

if (!DATABASE_URL || !SESSION_SECRET) {
  console.error("DATABASE_URL or SESSION_SECRET missing from .env.local");
  process.exit(1);
}

// Fresh benign fixture per run: no checked-in binary and no machine-specific
// path. A tiny store-only ZIP crosses the same quarantine -> scan -> promote
// path the real pipeline uses, and all byte/checksum comparisons are made
// within this run.
const fixtureDir = mkdtempSync(path.join(os.tmpdir(), "betamods-e2e-"));
const FIXTURE_PATH = path.join(fixtureDir, "build-0.1-benign.zip");
await new Promise((resolve, reject) => {
  const out = createWriteStream(FIXTURE_PATH);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  out.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(out);
  archive.append("Beta Mods e2e benign archive; no personal data.\n", { name: "build-0.1-benign.txt" });
  archive.finalize();
});
const benignBytes = readFileSync(FIXTURE_PATH);

const sql = postgres(DATABASE_URL, { max: 1 });
const results = [];
const skipped = [];
let controlsRestore = null;
let fixtureRestore = null;
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

console.log(`e2e configuration: storage=${STORAGE_DRIVER}, pilot=${PILOT_MODE ? "on" : "off"}; expected ${expectedChecks} checks`);
if (!PILOT_MODE) skipped.push("pilot authorization group: 6 checks (PILOT_MODE is not on in the selected env file)");
if (STORAGE_DRIVER !== "r2") skipped.push("R2-specific signed-download and scratch checks (local download-byte check used instead)");

let s3Client = null;
async function r2Client() {
  if (!s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3Client = new S3Client({
      region: "auto",
      endpoint: env("STORAGE_ENDPOINT"),
      credentials: {
        accessKeyId: env("STORAGE_ACCESS_KEY"),
        secretAccessKey: env("STORAGE_SECRET_KEY"),
      },
    });
  }
  return s3Client;
}
/** Fetch a stored object's bytes from R2, mirroring lib/storage.ts config. */
async function getStoredFromR2(key) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const out = await (await r2Client()).send(
      new GetObjectCommand({ Bucket: env("STORAGE_BUCKET"), Key: key }),
    );
    if (!out.Body) return null;
    return Buffer.from(await out.Body.transformToByteArray());
  } catch {
    return null;
  }
}

/**
 * Delete a stored object.
 *
 * Needed because this script resets by deleting build ROWS directly, which
 * bypasses deleteBetaMod's cleanup. On the r2 driver that would leave a real
 * orphan in the bucket on every run -- which the backup job then reports as a
 * failure. Clean up after ourselves instead.
 */
async function deleteFromR2(key) {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    await (await r2Client()).send(
      new DeleteObjectCommand({ Bucket: env("STORAGE_BUCKET"), Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Remove a known e2e object from local storage without accepting path escape. */
function deleteFromLocal(key) {
  const uploadsRoot = path.resolve(root, "data", "uploads");
  const target = path.resolve(uploadsRoot, key);
  if (!target.startsWith(`${uploadsRoot}${path.sep}`)) return false;
  if (existsSync(target)) unlinkSync(target);
  return true;
}

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
  return forms.find((seg) => seg.includes('name="versionLabel"') && seg.includes('id="build-file"')) ?? null;
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
  const mod = await sql`select id, owner_id, status from beta_mods where title = ${DEMO_MOD_TITLE} limit 1`;
  if (!owner[0] || !mod[0]) throw new Error("demo dataset missing — run scripts/seed-demo.mjs first");
  const ownerId = owner[0].id;
  const modId = mod[0].id;
  if (mod[0].owner_id !== ownerId) throw new Error("Demo fixture mod is not owned by the demo owner. No fixture changes made.");
  controlsRestore = await captureUploadTestState(sql, ownerId, PILOT_MODE);
  fixtureRestore = { id: modId, status: mod[0].status };
  await sql`update beta_mods set status = 'beta' where id = ${modId}`;
  await sql`insert into app_settings (key, value) values ('uploads_enabled', 'true')
            on conflict (key) do update set value = excluded.value`;
  const modUrl = `${BASE}/mods/${modId}`;

  // Fresh state for repeat runs. On r2 the stored objects are deleted too --
  // otherwise each run leaves an orphan the backup job would flag.
  const stale = await sql`select file_url from builds
    where beta_mod_id = ${modId}
      and version_label in (${BENIGN_LABEL}, ${EVIL_LABEL}, '0.1-debug')`;
  await sql`delete from builds where beta_mod_id = ${modId} and version_label in (${BENIGN_LABEL}, ${EVIL_LABEL}, '0.1-debug')`;
  for (const row of stale) {
    if (STORAGE_DRIVER === "r2") await deleteFromR2(row.file_url);
    // Also clear a same-key local fixture left by a previous driver run.
    deleteFromLocal(row.file_url);
  }

  const cookie = await mintSessionCookie(ownerId);

  // ---- 0. Pilot authorisation (only meaningful with PILOT_MODE=on) -------
  // The allowlist is the thing that makes this a pilot rather than a public
  // site, so when pilot mode is on, prove both halves of it: the form is not
  // rendered for an unapproved account, AND the server action refuses the POST
  // anyway. The second half is the one that matters -- hiding a form is a
  // hint, not a gate.
  let revokedFields = null;
  if (PILOT_MODE) {
    // Known starting state: uploads enabled, this account not approved.
    await sql`delete from pilot_accounts where user_id = ${ownerId}`;

    const denied = await fetch(modUrl, { headers: { Cookie: cookie } });
    const deniedHtml = await denied.text();
    check("unapproved tester is not offered the upload form", !uploadFormSegment(deniedHtml), "");
    check(
      "unapproved tester sees the invite-only message",
      /approved pilot testers/.test(deniedHtml),
      "",
    );

    // Approve, capture the real form fields, then revoke and replay them.
    await sql`insert into pilot_accounts (user_id) values (${ownerId})
              on conflict (user_id) do nothing`;
    const approved = await fetch(modUrl, { headers: { Cookie: cookie } });
    const approvedHtml = await approved.text();
    const approvedSeg = uploadFormSegment(approvedHtml);
    check("approving the account restores the upload form", Boolean(approvedSeg), "");
    revokedFields = approvedSeg ? hiddenFields(approvedSeg) : null;

    await sql`delete from pilot_accounts where user_id = ${ownerId}`;
    const gone = await fetch(modUrl, { headers: { Cookie: cookie } });
    check(
      "revoking takes the form away again (the gate is live, not cached)",
      !uploadFormSegment(await gone.text()),
      "",
    );

    // Now the real test: replay those exact $ACTION_* fields while the
    // account is revoked. A correct run answers with the invite-only refusal
    // and writes nothing.
    if (revokedFields) {
      const replay = await postForm(modUrl, cookie, revokedFields, {
        filename: "build-0.1-benign.zip",
        bytes: benignBytes,
        type: "application/zip",
        versionLabel: BENIGN_LABEL,
        changelog: "must be refused: unapproved",
      });
      const replayBody = replay.body.toString("utf8");
      const replayRows =
        await sql`select id from builds where beta_mod_id = ${modId} and version_label = ${BENIGN_LABEL}`;
      check(
        "the action refuses an unapproved POST (not just a hidden form)",
        replay.status !== 303 && /approved pilot testers/.test(replayBody),
        `status=${replay.status}`,
      );
      check("the refused POST created no build", replayRows.length === 0, `rows=${replayRows.length}`);
    } else {
      skipped.push("revoked-account POST replay: approved form was unavailable (run must fail)");
    }

    // Approve for the rest of the run, and leave the allowlist as we found it.
    await sql`insert into pilot_accounts (user_id) values (${ownerId})
              on conflict (user_id) do nothing`;
  }

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
  check("builds row inserted (e2e-0.1)", buildRow.length === 1, buildRow[0]?.file_url ?? "none");

  // ---- 2. Bytes at rest === fixture --------------------------------------
  let storedSha = null;
  let storedAt = null;
  if (buildRow[0]) {
    if (STORAGE_DRIVER === "r2") {
      const bytes = await getStoredFromR2(buildRow[0].file_url);
      storedSha = bytes ? sha256(bytes) : null;
      storedAt = `r2://${env("STORAGE_BUCKET")}/${buildRow[0].file_url}`;
    } else {
      const uploadsDir = path.join(root, "data", "uploads");
      const lastSegment = buildRow[0].file_url.split("/").pop();
      const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name === lastSegment) {
            storedAt = full;
            storedSha = sha256(readFileSync(full));
          }
        }
      };
      walk(uploadsDir);
    }
  }
  check("stored bytes == fixture bytes", storedSha === fixtureSha, `stored ${storedSha?.slice(0, 12) ?? "?"} vs fixture ${fixtureSha.slice(0, 12)}`);
  console.log("stored at:", storedAt);

  // ---- 3. Serve: GET /files/<buildId> ------------------------------------
  if (buildRow[0]) {
    const dl = await fetch(`${BASE}/files/${buildRow[0].id}`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    if (STORAGE_DRIVER === "r2") {
      // Production behaviour: a 302 to a short-lived presigned R2 URL, so the
      // archive travels R2 -> downloader instead of through the home PC.
      const location = dl.headers.get("location") ?? "";
      check(
        `GET /files/<id> redirects to a presigned R2 URL (${dl.status})`,
        dl.status === 302 &&
          location.startsWith("https://") &&
          /X-Amz-Signature=/.test(location) &&
          /X-Amz-Expires=/.test(location),
        `status=${dl.status} location=${location.slice(0, 80)}...`,
      );
      const ttl = Number(location.match(/X-Amz-Expires=(\d+)/)?.[1] ?? "0");
      check(
        "presigned URL expiry is short (not a long-lived public link)",
        ttl > 0 && ttl <= 900,
        `X-Amz-Expires=${ttl}`,
      );
      // The signed URL is what actually serves the bytes, so follow it and
      // confirm the archive really is retrievable end to end.
      if (location.startsWith("https://")) {
        const followed = await fetch(location);
        const followedBytes = Buffer.from(await followed.arrayBuffer());
        check(
          `presigned URL serves the fixture bytes (${followed.status})`,
          followed.status === 200 && sha256(followedBytes) === fixtureSha,
          `served ${sha256(followedBytes).slice(0, 12)}`,
        );
      } else {
        skipped.push("signed-download byte check: no HTTPS redirect was returned (run must fail)");
      }
      // A missing build must be a plain 404, never a redirect.
      const missing = await fetch(`${BASE}/files/00000000-0000-0000-0000-000000000000`, {
        headers: { Cookie: cookie },
        redirect: "manual",
      });
      check("GET /files/<unknown id> -> 404, no redirect", missing.status === 404, `status=${missing.status}`);
    } else {
      const dlBytes = Buffer.from(await dl.arrayBuffer());
      check(
        `GET /files/<id> serves fixture bytes (${dl.status})`,
        dl.status === 200 && sha256(dlBytes) === fixtureSha,
        `served ${sha256(dlBytes).slice(0, 12)}`,
      );
    }
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

  // ---- 4b. The blocked upload must not have consumed storage -------------
  // A rejected upload releases its reservation. If it did not, every failed
  // attempt would permanently eat into the pilot's budget.
  const ledger = await sql`
    select state, coalesce(sum(bytes), 0)::bigint as bytes, count(*)::int as n
    from storage_reservations
    where user_id = ${ownerId}
    group by state order by state
  `;
  const held = ledger.find((r) => r.state === "held");
  const released = ledger.find((r) => r.state === "released");
  const storedRow = ledger.find((r) => r.state === "stored");
  check(
    "no reservation left in flight after the run",
    !held,
    `held bytes=${held?.bytes ?? 0}`,
  );
  check(
    "the EICAR attempt is recorded as released, not held or stored",
    Boolean(released) && Number(released.n) >= 1,
    `released=${released?.n ?? 0}`,
  );
  check(
    "the successful upload is recorded as stored",
    Boolean(storedRow) && Number(storedRow.n) >= 1,
    `stored=${storedRow?.n ?? 0} bytes=${storedRow?.bytes ?? 0}`,
  );

  // ---- 4c. The bucket holds the archive and nothing else ------------------
  // With R2 the local volume is scratch, so the only copy must be in the
  // bucket -- and an EICAR sample must never be one of its objects.
  if (STORAGE_DRIVER === "r2") {
    const quarantineDir = path.join(root, "data", "quarantine");
    const leftovers = readdirSync(quarantineDir).filter(
      (f) => !f.endsWith(".tmp") && !f.endsWith(".lock"),
    );
    check("no quarantined bytes left on the PC", leftovers.length === 0, `left=${leftovers.join(",")}`);
    console.log(`storage driver: r2 (bucket ${env("STORAGE_BUCKET")})`);
  }

  // ---- verify EICAR actually detectable (sanity on the chain) ------------
  const scanProbe = await fetch("http://127.0.0.1:3311/", {
    method: "POST",
    headers: SCAN_API_KEY
      ? { authorization: `Bearer ${SCAN_API_KEY}` }
      : undefined,
    body: Buffer.from(EICAR, "latin1"),
  });
  const probeJson = await scanProbe.json().catch(() => null);
  check(
    "scan server flags EICAR directly",
    probeJson?.clean === false && /Eicar-Test-Signature/i.test(probeJson?.malware ?? ""),
    JSON.stringify(probeJson),
  );

  // ---- 5. The admin kill switch (always on, pilot mode or not) -----------
  // This is the control that stops a runaway upload without a deploy, so it
  // has to work for an already-approved account, not just an anonymous one.
  await sql`insert into app_settings (key, value) values ('uploads_enabled', 'false')
            on conflict (key) do update set value = excluded.value`;
  const paused = await fetch(modUrl, { headers: { Cookie: cookie } });
  const pausedHtml = await paused.text();
  check(
    "kill switch removes the upload form from an approved owner",
    !uploadFormSegment(pausedHtml),
    "",
  );
  check("kill switch says uploads are paused", /Uploads are paused/.test(pausedHtml), "");
  if (fields.length) {
    const refused = await postForm(modUrl, cookie, fields, {
      filename: "build-0.1-benign.zip",
      bytes: benignBytes,
      type: "application/zip",
      versionLabel: BENIGN_LABEL,
      changelog: "must be refused: uploads paused",
    });
    const refusedBody = refused.body.toString("utf8");
    const refusedRows =
      await sql`select id from builds where beta_mod_id = ${modId} and version_label = ${BENIGN_LABEL}`;
    check(
      "the action refuses a POST while uploads are paused",
      refused.status !== 303 && /Uploads are paused/.test(refusedBody),
      `status=${refused.status}`,
    );
    check("the refused POST created no build", refusedRows.length === 1, `rows=${refusedRows.length}`);
  }
  // The finally block restores the exact previous switch row, even when pilot
  // mode is off or a check throws. Never assume the starting value was true.

  // Leave neither a demo row nor object behind. All assertions above have
  // already exercised the build, download and ledger paths.
  const cleanupRows = await sql`select id, file_url from builds
    where beta_mod_id = ${modId} and version_label = ${BENIGN_LABEL}`;
  let objectCleanupOk = true;
  for (const row of cleanupRows) {
    if (STORAGE_DRIVER === "r2") {
      objectCleanupOk = (await deleteFromR2(row.file_url)) && objectCleanupOk;
    }
    objectCleanupOk = deleteFromLocal(row.file_url) && objectCleanupOk;
  }
  if (objectCleanupOk) {
    await sql`delete from builds
      where beta_mod_id = ${modId} and version_label = ${BENIGN_LABEL}`;
  }
  const cleanupRemaining = await sql`select count(*)::int as n from builds
    where beta_mod_id = ${modId} and version_label = ${BENIGN_LABEL}`;
  check(
    "e2e build and stored object cleaned up",
    objectCleanupOk && Number(cleanupRemaining[0]?.n ?? 0) === 0,
  );
} catch (error) {
  console.error("ERROR:", error.message);
  results.push("FAIL  run errored");
} finally {
  try { rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* best effort */ }
  if (fixtureRestore) {
    try { await sql`update beta_mods set status = ${fixtureRestore.status} where id = ${fixtureRestore.id}`; }
    catch { results.push("FAIL  fixture status restore failed"); }
  }
  if (controlsRestore) {
    try {
      await restoreUploadTestState(sql, controlsRestore);
    } catch (restoreError) {
      console.error("ERROR restoring upload controls:", restoreError.message);
      results.push("FAIL  upload control state restore errored");
    }
  }
  await sql.end();
}

console.log("\n--- e2e upload results ---");
for (const line of results) console.log(line);
for (const reason of skipped) console.log(`SKIP  ${reason}`);
const failures = results.filter((l) => l.startsWith("FAIL"));
const passed = results.length - failures.length;
console.log(`\n${passed}/${results.length} checks passed; expected ${expectedChecks} checks for storage=${STORAGE_DRIVER}, pilot=${PILOT_MODE ? "on" : "off"}.`);
if (failures.length || results.length !== expectedChecks) {
  if (failures.length) console.error(`${failures.length} check(s) failed`);
  if (results.length !== expectedChecks) console.error("Assertion count mismatch: the configured run did not complete its expected checks.");
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed.");
}
