import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";

let tooling: typeof import("../scripts/dev-database.mjs");
before(async () => { tooling = await import("../scripts/dev-database.mjs"); });

const devUrl = "postgresql://fixture:unused@dev.example.test/app";
const prodUrl = "postgresql://fixture:unused@production.example.test/app";
const cloudUrl = "postgresql://fixture:unused@pilot.example.test/app";
// The installed driver's runtime supports a socket factory, though its public
// Options type omits it. Keep the test factory alongside the typed options.
const offlineOptions = { max: 1, socket: () => assert.fail("Option parsing must not connect") };

test("database isolation compares pooled and direct endpoints, not credentials or paths", () => {
  assert.doesNotThrow(() => tooling.assertDevDatabase(devUrl, prodUrl));
  assert.throws(() => tooling.assertDevDatabase(
    "postgresql://another:unused@production-pooler.example.test/other",
    prodUrl,
  ), /production endpoint/);
  assert.throws(() => tooling.assertDevDatabase(
    "postgresql://fixture:unused@PRODUCTION.EXAMPLE.TEST/app",
    prodUrl,
  ), /production endpoint/);
  for (const hostname of ["production.example.test.", "PRODUCTION-POOLER.EXAMPLE.TEST."]) {
    assert.throws(() => tooling.assertDevDatabase(
      `postgresql://fixture:unused@${hostname}/app`, prodUrl,
    ), /production endpoint/);
  }
});

test("database isolation rejects missing, invalid and non-PostgreSQL configuration", () => {
  for (const value of [undefined, "", "not-a-url", "https://dev.example.test/app"]) {
    assert.throws(() => tooling.assertDevDatabase(value, prodUrl));
    assert.throws(() => tooling.assertDevDatabase(devUrl, value));
  }
});

test("database isolation refuses driver fallback and failover targets", () => {
  for (const value of [
    "postgresql:///app",
    "postgresql:/app",
    "postgresql://fixture:unused@dev.example.test,production.example.test/app",
    "postgresql://fixture:unused@production.example.test,dev.example.test/app",
    "postgresql://fixture:unused@dev.example.test%2cproduction.example.test/app",
  ]) {
    assert.throws(() => tooling.assertDevDatabase(value, prodUrl), /single explicit hostname/);
    assert.throws(() => tooling.assertDevDatabase(devUrl, value), /single explicit hostname/);
  }
});

test("database guard rejects literal and encoded failover hosts recognized by postgres-js", async () => {
  for (const separator of [",", "%2c", "%2C"]) {
    const url = `postgresql://fixture:unused@dev.example.test${separator}production.example.test/app`;
    const client = postgres(url, offlineOptions);
    try {
      assert.deepEqual(client.options.host, ["dev.example.test", "production.example.test"]);
      assert.throws(() => tooling.assertDevDatabase(url, prodUrl), /single explicit hostname/);
    } finally { await client.end(); }
  }
});

test("URL query host parameters and single encoded hosts do not retarget postgres-js", async () => {
  for (const [url, expectedHost] of [
    [`${devUrl}?host=production.example.test`, "dev.example.test"],
    [`${devUrl}?hostname=production.example.test`, "dev.example.test"],
    [`${devUrl}?hostaddr=192.0.2.1`, "dev.example.test"],
    ["postgresql://fixture:unused@%70roduction.example.test/app", "%70roduction.example.test"],
    ["postgresql://fixture:unused@production.example.test%2e/app", "production.example.test%2e"],
  ]) {
    const client = postgres(url, offlineOptions);
    try {
      assert.deepEqual(client.options.host, [expectedHost]);
      assert.doesNotThrow(() => tooling.assertDevDatabase(url, prodUrl));
    } finally { await client.end(); }
  }
});

test("dev configuration excludes both known production endpoints without loading their secrets", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "betamods-dev-env-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, ".env.local"), `DATABASE_URL="${devUrl}"\nSESSION_SECRET=dev-fixture-only\n`);
  writeFileSync(path.join(root, ".env.production"), `DATABASE_URL=${prodUrl}\nPRIVATE_FIXTURE=not-for-dev\n`);
  writeFileSync(path.join(root, ".env.cloud.local"), `DATABASE_URL=${cloudUrl}\nPRIVATE_FIXTURE=not-for-dev\n`);
  assert.deepEqual(tooling.readDevEnvironment(root), { DATABASE_URL: devUrl, SESSION_SECRET: "dev-fixture-only" });

  writeFileSync(path.join(root, ".env.local"), `DATABASE_URL=${cloudUrl.replace("pilot.", "pilot-pooler.")}\n`);
  assert.throws(() => tooling.readDevEnvironment(root), /production endpoint/);
  writeFileSync(path.join(root, ".env.local"), `DATABASE_URL=${prodUrl}\n`);
  assert.throws(() => tooling.readDevEnvironment(root), /production endpoint/);
});

test("missing production configuration cannot authorize dev writes", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "betamods-dev-env-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, ".env.local"), `DATABASE_URL=${devUrl}\n`);
  assert.throws(() => tooling.readDevEnvironment(root), /Both dev and production/);
});

test("all database integration suites use the shared deployment guard", () => {
  const root = path.join(import.meta.dirname, "integration");
  for (const name of readdirSync(root).filter(name => name.endsWith(".test.ts"))) {
    const source = readFileSync(path.join(root, name), "utf8");
    assert.match(source, /readDevEnvironment\(root\)/, name);
    assert.match(source, /describe\.skip/, name);
  }
});

test("dev scripts isolate their database before opening a connection", () => {
  for (const name of ["seed-demo.mjs", "test-auth-flow.mjs", "e2e-profile.mjs", "e2e-upload.mjs", "e2e-feedback.mjs", "apply-migrations.mjs"]) {
    const source = readFileSync(path.join(import.meta.dirname, "..", "scripts", name), "utf8");
    assert.ok(source.indexOf("readDevEnvironment(root)") < source.indexOf("postgres("), name);
  }
});

test("preview validates dev isolation before applying the home configuration", () => {
  const source = readFileSync(path.join(import.meta.dirname, "..", "scripts", "local-service.mjs"), "utf8");
  assert.ok(source.indexOf("readDevEnvironment(root)") < source.indexOf("const config ="));
  assert.match(source, /databaseEndpoint\(home\.DATABASE_URL\) !== databaseEndpoint\(local\.DATABASE_URL\)/);
  assert.match(source, /const config = \{ \.\.\.local, \.\.\.home, DATABASE_URL: local\.DATABASE_URL \}/);
});

test("auth fixtures clean up only their inserted ID and never print token fragments", () => {
  const source = readFileSync(path.join(import.meta.dirname, "..", "scripts", "test-auth-flow.mjs"), "utf8");
  assert.match(source, /if \(createdUserId\) await sql`delete from users where id =/);
  assert.doesNotMatch(source, /delete from users where email|token\.slice|dev-insecure-secret/);
});

test("profile rehearsal captures state before mutation and restores all edited fields on failure", () => {
  const source = readFileSync(path.join(import.meta.dirname, "..", "scripts", "e2e-profile.mjs"), "utf8");
  assert.ok(source.indexOf("originalProfile = owner[0]") < source.indexOf("profileChanged = true"));
  assert.match(source, /finally \{[\s\S]*if \(profileChanged && originalProfile\)/);
  for (const field of ["display_name", "bio", "avatar_url", "id"]) {
    assert.ok(source.includes(`\${originalProfile.${field}}`), `cleanup restores ${field}`);
  }
});
