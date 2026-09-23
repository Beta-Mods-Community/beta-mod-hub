// End-to-end check of the auth primitives the server actions use, against the
// real .env.local config: bcrypt hashing/compare, a users insert into Neon,
// and a jose session encrypt/decrypt round trip. Creates and then deletes a
// throwaway test account, so the email stays available.
//
// Usage: node scripts/test-auth-flow.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { SignJWT, jwtVerify } from "jose";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = readFileSync(path.join(root, ".env.local"), "utf8");
const env = (key) => envFile.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1].trim();
const sql = postgres(env("DATABASE_URL"), { max: 4, prepare: false });

const email = "e2e-auth-test@example.com";
const password = "TestPass123!";

try {
  // 1. Signup path: hash + insert
  const passwordHash = await bcrypt.hash(password, 10);
  const inserted = await sql`
    insert into users (email, password_hash, display_name)
    values (${email}, ${passwordHash}, ${"E2E Test"})
    returning id, email, display_name
  `;
  const user = inserted[0];
  if (!user) throw new Error("user insert returned nothing");
  console.log("signup insert OK:", user.email, "| id:", user.id);

  // 2. Login path: fetch by email + compare
  const row = await sql`select password_hash from users where email = ${email}`;
  if (row.length !== 1) throw new Error("expected exactly one matching user");
  const ok = await bcrypt.compare(password, row[0].password_hash);
  if (!ok) throw new Error("password compare failed");
  const wrong = await bcrypt.compare("WrongPass!", row[0].password_hash);
  if (wrong) throw new Error("wrong password unexpectedly matched");
  console.log("login compare OK: correct matches, wrong password rejected");

  // 3. Session round trip (same secret the app uses)
  const secret = env("SESSION_SECRET") ?? "dev-insecure-secret-change-me";
  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({ userId: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  if (payload.userId !== user.id) throw new Error("session payload mismatch");
  const tampered = token.slice(0, -4) + "AAAA";
  console.log("  orig tail:", JSON.stringify(token.slice(-12)), "| tampered tail:", JSON.stringify(tampered.slice(-12)));
  console.log("  segments:", token.split(".").length, "vs", tampered.split(".").length);
  const bad = await jwtVerify(tampered, key, { algorithms: ["HS256"] })
    .then(() => true)
    .catch((e) => {
      console.log("  reject reason:", e.code);
      return false;
    });
  if (bad) throw new Error("tampered token was accepted");
  console.log("session round trip OK: valid token verifies, tampered token rejected");
} finally {
  await sql`delete from users where email = ${email}`;
  await sql.end();
}
console.log("test auth flow: PASS (test account cleaned up)");