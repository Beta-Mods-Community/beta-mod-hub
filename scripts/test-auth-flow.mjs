// End-to-end check of the auth primitives the server actions use, against the
// real .env.local config: bcrypt hashing/compare, a users insert into Neon,
// and a signed-session verification round trip. Uses a unique fixture account
// in the isolated dev database and deletes only the row created by this run.
//
// Usage: node scripts/test-auth-flow.mjs
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { SignJWT, jwtVerify } from "jose";
import { readDevEnvironment } from "./dev-database.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = readDevEnvironment(root);
if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is required in .env.local.");
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });

const email = `e2e-auth-${randomUUID()}@betamods.test`;
const password = randomUUID();
let createdUserId;

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
  createdUserId = user.id;
  console.log("signup insert OK");

  // 2. Login path: fetch by email + compare
  const row = await sql`select password_hash from users where email = ${email}`;
  if (row.length !== 1) throw new Error("expected exactly one matching user");
  const ok = await bcrypt.compare(password, row[0].password_hash);
  if (!ok) throw new Error("password compare failed");
  const wrong = await bcrypt.compare("WrongPass!", row[0].password_hash);
  if (wrong) throw new Error("wrong password unexpectedly matched");
  console.log("login compare OK: correct matches, wrong password rejected");

  // 3. Session round trip (same secret the app uses)
  const key = new TextEncoder().encode(env.SESSION_SECRET);
  const token = await new SignJWT({ userId: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  if (payload.userId !== user.id) throw new Error("session payload mismatch");
  const parts = token.split(".");
  parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
  const tampered = parts.join(".");
  const bad = await jwtVerify(tampered, key, { algorithms: ["HS256"] })
    .then(() => true)
    .catch(() => false);
  if (bad) throw new Error("tampered token was accepted");
  console.log("session round trip OK: valid token verifies, tampered token rejected");
} finally {
  try {
    if (createdUserId) await sql`delete from users where id = ${createdUserId}`;
  } finally {
    await sql.end();
  }
}
console.log("test auth flow: PASS (test account cleaned up)");
