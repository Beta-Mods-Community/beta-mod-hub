// Real HTTP server-action checks; disposable verified users on dev only.
// This suite is DESTRUCTIVE (creates users, reports and storage objects, then
// deletes them). It is deliberately pinned to .env.local — the *only* env file
// it will ever read. When .env.home is pointed at the production branch for the
// real deploy, the documented command must still be harmless.
// Usage: E2E_STORAGE_DRIVER=r2 node scripts/e2e-feedback.mjs
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { SignJWT } from "jose";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { assertDevDatabase, readPrivateEnv } from "./dev-database.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFileName = process.env.E2E_ENV_FILE || ".env.local";
if (envFileName !== ".env.local") {
  throw new Error(
    `e2e-feedback is a destructive dev-only suite: E2E_ENV_FILE must be ".env.local", not "${envFileName}".`,
  );
}
const env = readPrivateEnv(root, envFileName);
assertDevDatabase(env.DATABASE_URL, readPrivateEnv(root, ".env.production").DATABASE_URL);
if (!env.SESSION_SECRET) throw new Error("Missing local session configuration.");
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
const driver = process.env.E2E_STORAGE_DRIVER || env.STORAGE_DRIVER || "local";
const base = "http://127.0.0.1:3000";
const ownerId = randomUUID(), testerId = randomUUID(), strangerId = randomUUID(), modId = randomUUID(), buildId = randomUUID(), nextBuildId = randomUUID();
const url = `${base}/mods/${modId}`;
const results = [];
const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const logBytes = "Beta Mods feedback e2e: diagnostic log, no personal data.\n";
let created = false;

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  results.push(!!condition);
}
async function cookie(userId) {
  const token = await new SignJWT({ userId, sessionVersion: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(env.SESSION_SECRET));
  return `session=${token}`;
}
const ownerCookie = await cookie(ownerId), testerCookie = await cookie(testerId), strangerCookie = await cookie(strangerId);
async function page(sessionCookie, extra = "") {
  const response = await fetch(url + extra, { headers: { Cookie: sessionCookie } });
  if (!response.ok) throw new Error(`Fixture page HTTP ${response.status}`);
  return response.text();
}
function form(html, marker) {
  const segment = html.split(/<form\b/i).slice(1).find(part => part.split("</form>")[0].includes(marker));
  if (!segment) throw new Error(`Expected form absent: ${marker}`);
  const fields = [];
  for (const match of segment.split("</form>")[0].matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(match[0])?.[1];
    const raw = /value="([^"]*)"/.exec(match[0])?.[1] ?? "";
    if (name) fields.push([name, raw.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&")]);
  }
  if (!fields.some(([name]) => name.startsWith("$ACTION_"))) throw new Error("Missing signed server action metadata");
  return fields;
}
async function post(fields, sessionCookie, values = {}, attachment) {
  const data = new FormData();
  for (const [name, value] of fields) data.append(name, value);
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  if (attachment) data.set(attachment.field ?? "attachment", new Blob([attachment.bytes], { type: "application/octet-stream" }), attachment.name);
  const response = await fetch(url, { method: "POST", body: data, headers: { Cookie: sessionCookie, Origin: base }, redirect: "manual" });
  return { status: response.status, location: decodeURIComponent(response.headers.get("location") ?? ""), body: await response.text() };
}
async function download(id, sessionCookie) {
  return fetch(`${base}/attachments/${id}`, { headers: sessionCookie ? { Cookie: sessionCookie } : {}, redirect: "manual" });
}
async function removeStored(key) {
  if (driver === "r2") {
    const client = new S3Client({ region: "auto", endpoint: env.STORAGE_ENDPOINT, credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY } });
    try { await client.send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key })); }
    finally { client.destroy(); }
  } else {
    const uploads = path.resolve(root, "data", "uploads");
    const target = path.resolve(uploads, key);
    if (!target.startsWith(uploads + path.sep)) throw new Error("Unsafe fixture storage key");
    if (existsSync(target)) unlinkSync(target);
  }
}

try {
  await sql`insert into users (id, display_name, email_verified_at) values
    (${ownerId}, 'Feedback test owner', now()), (${testerId}, 'Feedback test reporter', now()), (${strangerId}, 'Feedback test stranger', now())`;
  created = true;
  await sql`insert into pilot_accounts (user_id, approved_by) values (${ownerId}, 'feedback-e2e'), (${testerId}, 'feedback-e2e')`;
  await sql`insert into beta_mods (id, owner_id, title, game, status) values (${modId}, ${ownerId}, 'Temporary feedback workflow test', 'Test', 'beta')`;
  await sql`insert into builds (id, beta_mod_id, version_label, file_url, uploaded_at) values (${buildId}, ${modId}, 'e2e-1', ${`tests/${buildId}`}, now() - interval '1 minute')`;
  const testerPage = await page(testerCookie);
  const reportFields = form(testerPage, 'name="attachment"');
  const oldVoteFields = form(testerPage, '>Ready</button>');
  const initialOwnerPage = await page(ownerCookie);
  const uploadFields = form(initialOwnerPage, 'name="versionLabel"');
  const values = { buildId, severity: "major", description: "The test fixture reproduces an example crash.", reproSteps: "Load the fixture and reproduce the test." };
  const submission = await post(reportFields, testerCookie, values, { name: "diagnostic.log", bytes: logBytes });
  check("clean diagnostic report submits through the real action", submission.status === 303);
  const [report] = await sql`select * from bug_reports where beta_mod_id=${modId}`;
  if (!report) throw new Error("Clean report was not created");
  const [attachment] = await sql`select a.*, r.state from bug_attachments a join storage_reservations r on r.id=a.reservation_id where a.report_id=${report.id}`;
  check("attachment is scanned and quota is settled", attachment?.scan_state === "clean" && attachment?.state === "stored" && Number(attachment?.size_bytes) === Buffer.byteLength(logBytes));
  if (!attachment) throw new Error("Attachment row absent");
  check("anonymous and unrelated users cannot fetch the private attachment", (await download(attachment.id)).status === 404 && (await download(attachment.id, strangerCookie)).status === 404);
  for (const [label, sessionCookie] of [["reporter", testerCookie], ["author", ownerCookie]]) {
    const response = await download(attachment.id, sessionCookie);
    if (driver === "r2") {
      const signed = response.headers.get("location");
      check(`${label} receives a private short-lived R2 download`, response.status === 302 && !!signed && Number(new URL(signed).searchParams.get("X-Amz-Expires")) <= 60);
      const bytes = signed ? await (await fetch(signed)).text() : "";
      check(`${label} receives identical attachment bytes`, bytes === logBytes);
    } else check(`${label} receives identical attachment bytes`, response.status === 200 && await response.text() === logBytes);
  }
  const malicious = await post(reportFields, testerCookie, { ...values, description: "Malicious test report must never persist." }, { name: "eicar.log", bytes: eicar });
  check("EICAR attachment is blocked by the live scanner", malicious.status !== 303 && /Attachment blocked/.test(malicious.body));
  check("blocked report and attachment never persist", (await sql`select id from bug_reports where beta_mod_id=${modId}`).length === 1 && (await sql`select id from bug_attachments where beta_mod_id=${modId}`).length === 1);
  const disallowed = await post(reportFields, testerCookie, values, { name: "diagnostic.html", bytes: logBytes });
  check("disallowed attachment format is refused", disallowed.status !== 303 && /supported game save/.test(disallowed.body));
  check("failed submissions leave no held quota", (await sql`select id from storage_reservations where user_id=${testerId} and state='held'`).length === 0);

  await sql`insert into builds (id, beta_mod_id, version_label, file_url) values (${nextBuildId}, ${modId}, 'e2e-2', ${`tests/${nextBuildId}`})`;
  const stale = await post(oldVoteFields, testerCookie);
  check("stale page verdict is rejected without being assigned to the new build", stale.status === 303 && /vote was not saved/.test(stale.location) && (await sql`select id from ready_signals where beta_mod_id=${modId}`).length === 0);
  const responseFields = form(await page(ownerCookie), 'name="response"');
  const ownerUpdate = await post(responseFields, ownerCookie, { reportId: report.id, status: "fixed", response: "Corrected the crash in e2e-2; please retest.", requestRetest: "on" });
  const [workflow] = await sql`select * from bug_report_workflow where report_id=${report.id}`;
  check("author response requests a retest of the latest build", ownerUpdate.status === 303 && workflow?.retest_status === "requested" && workflow?.retest_build_id === nextBuildId);
  const forged = await post(responseFields, strangerCookie, { reportId: report.id, status: "open", response: "Forged response must not be accepted." });
  const [stillFixed] = await sql`select status from bug_reports where id=${report.id}`;
  check("forged owner response fails authorization", /Only the mod author/.test(forged.location) && stillFixed?.status === "fixed");
  const retestFields = form(await page(testerCookie), 'name="notes"');
  const retest = await post(retestFields, testerCookie, { reportId: report.id, buildId: nextBuildId, result: "still-present", notes: "The same issue remains in build e2e-2." });
  const [reopened] = await sql`select b.status, w.retest_status, w.retest_build_id from bug_reports b join bug_report_workflow w on w.report_id=b.id where b.id=${report.id}`;
  check("reporter's build-specific retest reopens an unresolved bug", retest.status === 303 && reopened?.status === "open" && reopened?.retest_status === "still-present" && reopened?.retest_build_id === nextBuildId);
  const filtered = await page(testerCookie, "?bugStatus=fixed");
  check("status filter excludes reports that no longer match", !filtered.includes(`id="report-${report.id}"`));
  check("author and reporter receive update notifications", (await sql`select id from notifications where user_id in (${ownerId}, ${testerId})`).length >= 3);
  const removalFields = form(await page(testerCookie), 'name="attachmentId"');
  await post(removalFields, testerCookie, { attachmentId: attachment.id });
  check("reporter can remove the stored attachment and free its quota", (await sql`select id from bug_attachments where id=${attachment.id}`).length === 0 && (await sql`select id from storage_reservations where id=${attachment.reservation_id}`).length === 0 && (await download(attachment.id, ownerCookie)).status === 404);

  await sql`update beta_mods set status='promoted', nexus_url='https://www.nexusmods.com/skyrimspecialedition/mods/1' where id=${modId}`;
  const afterPublish = await post(reportFields, testerCookie, { ...values, description: "Published mods cannot accept new bug reports." });
  check("replaying a bug form after publication is rejected", /read-only/.test(afterPublish.body) && (await sql`select id from bug_reports where beta_mod_id=${modId}`).length === 1);
  const afterPublishResponse = await post(responseFields, ownerCookie, { reportId: report.id, status: "fixed", response: "Published mutation should not save." });
  check("replaying an owner response after publication is rejected", /read-only/.test(afterPublishResponse.location));
  const afterPublishUpload = await post(uploadFields, ownerCookie, { versionLabel: "forbidden", changelog: "must not store" }, { field: "file", name: "forbidden.zip", bytes: logBytes });
  check("replaying an upload after publication is rejected", /read-only/.test(afterPublishUpload.body) && (await sql`select id from builds where beta_mod_id=${modId}`).length === 2);
} catch (error) {
  console.error(`FAIL feedback e2e stopped: ${error.message}`);
  results.push(false);
} finally {
  if (created) {
    try {
      const attachments = await sql`select object_key from bug_attachments where beta_mod_id=${modId}`;
      for (const row of attachments) await removeStored(row.object_key);
      await sql`delete from beta_mods where id=${modId}`;
      await sql`delete from users where id in (${ownerId}, ${testerId}, ${strangerId})`;
      check("temporary feedback users, reports, and storage cleaned up", true);
    } catch { check("temporary fixture cleanup (operator reconciliation required)", false); }
  }
  await sql.end();
}
const passed = results.filter(Boolean).length;
console.log(`Feedback e2e: ${passed}/${results.length} checks passed.`);
if (passed !== results.length) process.exitCode = 1;
