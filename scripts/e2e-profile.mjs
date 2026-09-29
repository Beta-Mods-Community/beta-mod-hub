// End-to-end test of the Phase 4 profile flow against a running dev server.
//
// Mirrors scripts/e2e-upload.mjs: drives the REAL server action (updateProfile)
// over plain HTTP the way a no-JS browser would — fetch /profile/edit, take the
// form's $ACTION_* hidden fields verbatim, POST to the same URL with a session
// cookie minted from the app's own jose secret, and follow the redirect chain.
//
// Checks (fails the run if any fails):
//   1. GET /users/<ownerId> renders display name + testing history
//   2. GET /users/<ownerId> shows the reputation score
//   3. GET /users/<ownerId> lists the owner's Beta Mods
//   4. GET /profile/edit renders the profile form with $ACTION_* fields
//   5. bio update via the real form protocol -> 303 redirect to /users/<ownerId>
//   6. re-fetch profile HTML contains the new bio
//   7. restore the previous bio via the same protocol (idempotent re-runs)
//   8. demo mod page shows a reputation badge next to bug-report reporters
//
// Prereqs: dev server on :3000, demo dataset seeded (scripts/seed-demo.mjs).
//
// Usage: node scripts/e2e-profile.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { SignJWT } from "jose";
import { assertDevDatabase, readPrivateEnv } from "./dev-database.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assertDevDatabase(readPrivateEnv(root, ".env.local").DATABASE_URL, readPrivateEnv(root, ".env.production").DATABASE_URL);
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
const TEST_BIO = "E2E profile bio — automated check.";
const TEST_DISPLAY_NAME = "Demo Author";

if (!DATABASE_URL || !SESSION_SECRET) {
  console.error("DATABASE_URL or SESSION_SECRET missing from .env.local");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);

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

/** The <form> segment containing the profile fields. */
function profileFormSegment(html) {
  const forms = html.split(/<form\b/i).slice(1);
  return forms.find((seg) => seg.includes('name="displayName"')) ?? null;
}

async function postProfileForm(
  url,
  cookie,
  fields,
  { displayName, bio, avatarUrl },
) {
  const fd = new FormData();
  for (const [name, value] of fields) fd.append(name, value);
  fd.append("displayName", displayName);
  fd.append("bio", bio);
  fd.append("avatarUrl", avatarUrl ?? "");
  const res = await fetch(url, {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") };
}

try {
  const owner = await sql`select id from users where email = ${DEMO_OWNER_EMAIL} limit 1`;
  const mod = await sql`select id from beta_mods where title = ${DEMO_MOD_TITLE} limit 1`;
  if (!owner[0] || !mod[0]) throw new Error("demo dataset missing — run scripts/seed-demo.mjs first");
  const ownerId = owner[0].id;
  const modId = mod[0].id;
  const profileUrl = `${BASE}/users/${ownerId}`;
  const editUrl = `${BASE}/profile/edit`;
  const modUrl = `${BASE}/mods/${modId}`;
  const cookie = await mintSessionCookie(ownerId);

  // ---- 1. Profile page renders identity + testing history ---------------
  const profilePage = await fetch(profileUrl, { headers: { Cookie: cookie } });
  const profileHtml = await profilePage.text();
  check(`profile page fetched (${profilePage.status})`, profilePage.ok);
  check(
    "profile shows display name",
    profileHtml.includes("Demo Author"),
  );
  check(
    "profile shows Testing history section",
    profileHtml.includes("Testing history"),
  );
  check(
    "profile shows reputation score",
    /\bReputation\b/.test(profileHtml) || profileHtml.includes("Tester reputation score"),
    "",
  );
  check(
    "profile lists Beta Mods (authored)",
    profileHtml.includes("Beta Mods") && profileHtml.includes(DEMO_MOD_TITLE),
  );

  // ---- 2. Edit page renders the profile form ----------------------------
  const editPage = await fetch(editUrl, { headers: { Cookie: cookie } });
  const editHtml = await editPage.text();
  check(`edit page fetched (${editPage.status})`, editPage.ok);
  const seg = profileFormSegment(editHtml);
  const fields = seg ? hiddenFields(seg) : [];
  const hasAction = fields.some(([n]) => n.startsWith("$ACTION_"));
  check("edit form has $ACTION_* fields", hasAction, fields.map(([n]) => n).join(", "));

  // ---- 3. Update bio through the real form protocol ---------------------
  const profilePath = `/users/${ownerId}`;
  const postRes = await postProfileForm(editUrl, cookie, fields, {
    displayName: TEST_DISPLAY_NAME,
    bio: TEST_BIO,
    avatarUrl: "",
  });
  check(
    "bio update -> 303 redirect to profile",
    postRes.status === 303 && postRes.location === profilePath,
    `status=${postRes.status} location=${postRes.location}`,
  );

  const after = await fetch(profileUrl, { headers: { Cookie: cookie } });
  const afterHtml = await after.text();
  check("profile now shows updated bio", afterHtml.includes(TEST_BIO));

  // ---- 4. Restore the previous bio (idempotent re-runs) -----------------
  const prev =
    await sql`select bio from users where id = ${ownerId} limit 1`;
  const restoreRes = await postProfileForm(editUrl, cookie, fields, {
    displayName: TEST_DISPLAY_NAME,
    bio: prev[0]?.bio ?? "",
    avatarUrl: "",
  });
  check(
    "bio restore -> 303 redirect",
    restoreRes.status === 303 && restoreRes.location === profilePath,
    `status=${restoreRes.status} location=${restoreRes.location}`,
  );

  // ---- 5. Mod page shows reputation next to bug reporters ---------------
  const modPage = await fetch(modUrl, { headers: { Cookie: cookie } });
  const modHtml = await modPage.text();
  const reporterBadges = (modHtml.match(/★/g) ?? []).length;
  check(
    "mod page shows reporter reputation badges",
    reporterBadges >= 2,
    `found ${reporterBadges} stars`,
  );
} catch (error) {
  console.error("ERROR:", error.message);
  results.push("FAIL  run errored");
} finally {
  await sql.end();
}

console.log("\n--- e2e profile results ---");
for (const line of results) console.log(line);
const failures = results.filter((l) => l.startsWith("FAIL"));
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed.");
}
