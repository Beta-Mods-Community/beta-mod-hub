// Seeds a small private fixture dataset so the BetaMod page (bug reports,
// ready votes) can be inspected locally without hand-typing data. The fixture
// mod is always `abandoned`, which keeps synthetic content out of the public
// Browse feed while preserving its stable URL for integration/e2e checks.
//
// Usage: node scripts/seed-demo.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { readDevEnvironment } from "./dev-database.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = readDevEnvironment(root);
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });

const DEMO_TITLE = "Demo: Emberwood Weapon Pack (Beta)";

try {
  // Demo accounts (owner + two testers).
  const owner = await ensureUser(sql, "demo-owner@betamods.test", "Demo Author");
  const t1 = await ensureUser(sql, "demo-tester-1@betamods.test", "Demo Tester 1");
  const t2 = await ensureUser(sql, "demo-tester-2@betamods.test", "Demo Tester 2");

  // Demo mod.
  const mods = await sql`
    select id from beta_mods where title = ${DEMO_TITLE} and owner_id = ${owner.id} limit 1
  `;
  let modId = mods[0]?.id;
  if (!modId) {
    const inserted = await sql`
      insert into beta_mods (owner_id, title, description, game, tags, status)
      values (
        ${owner.id},
        ${DEMO_TITLE},
        ${"A weapons pack in open beta. Magic variants crash when blocking — see the blocking report. Feedback via structured reports and the ready vote, please."},
        ${"Skyrim"},
        ${["combat", "weapons", "demo"]},
        ${"abandoned"}
      )
      returning id
    `;
    modId = inserted[0].id;
    console.log("created demo mod");
  } else {
    console.log("demo mod already exists");
  }

  // This is test infrastructure, not a real pilot listing. Reassert the
  // hidden status on every idempotent run in case an older seed created it as
  // an active beta.
  await sql`update beta_mods set status = 'abandoned' where id = ${modId}`;

  const url = `http://localhost:3000/mods/${modId}`;

  const buildRows = await sql`
    select id from builds
    where beta_mod_id = ${modId}
    order by uploaded_at desc, id desc
    limit 1
  `;
  const buildId = buildRows[0]?.id;
  if (!buildId) {
    console.log(
      "demo mod has no build; skipping build-scoped reports and verdicts",
    );
  } else {
    // Reuse the same reports on repeated runs for this build and reporter.
    await insertReport(
      sql,
      modId,
      buildId,
      t1.id,
      "blocking",
      "Blocking with a magic weapon crashes to desktop. Equip any elemental variant and hold block — the game hard-crashes every time.",
      "1. Equip a fire or frost variant\n2. Hold block against an attack\n3. Game crashes",
    );
    await insertReport(
      sql,
      modId,
      buildId,
      t2.id,
      "minor",
      "Sheathe sound plays twice after a power attack.",
      "Power attack, then sheathe — the draw/sheath audio loops twice.",
    );

    // Ready verdicts: one ready, one not ready, both for this build.
    await upsertVote(sql, modId, buildId, t1.id, true);
    await upsertVote(sql, modId, buildId, t2.id, false);
  }

  console.log("URL:", url);
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

async function ensureUser(sql, email, displayName) {
  const existing = await sql`
    select id from users where email = ${email} limit 1
  `;
  if (existing[0]) return existing[0];

  const inserted = await sql`
    insert into users (email, display_name) values (${email}, ${displayName})
    returning id
  `;
  return inserted[0];
}

async function insertReport(
  sql,
  modId,
  buildId,
  reporterId,
  severity,
  description,
  reproSteps,
) {
  const existing = await sql`
    select id from bug_reports
    where beta_mod_id = ${modId} and build_id = ${buildId}
      and reporter_id = ${reporterId} and description = ${description}
    limit 1
  `;
  if (existing[0]) return;
  await sql`
    insert into bug_reports
      (beta_mod_id, build_id, reporter_id, severity, description, repro_steps)
    values (
      ${modId}, ${buildId}, ${reporterId}, ${severity}, ${description},
      ${reproSteps ?? null}
    )
  `;
}

async function upsertVote(sql, modId, buildId, testerId, isReady) {
  await sql`
    insert into ready_signals (beta_mod_id, build_id, tester_id, is_ready)
    values (${modId}, ${buildId}, ${testerId}, ${isReady})
    on conflict (build_id, tester_id)
    do update set
      beta_mod_id = excluded.beta_mod_id,
      is_ready = excluded.is_ready,
      created_at = now()
  `;
}
