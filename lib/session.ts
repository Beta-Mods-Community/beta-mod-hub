import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "../db/schema";
import { sessionVersionMatches } from "./account-policy";

/**
 * Stateless sessions (JWT in an httpOnly cookie) — the pattern from the
 * Next.js 16 auth guide. Swaps to Nexus SSO in phase 3; the cookie+session
 * shape stays the same.
 */

/**
 * SESSION_SECRET guards: production refuses to sign sessions with a
 * hardcoded fallback key (that would let anyone forge a session). The dev
 * fallback exists only so `next dev` works with no env file. The key is
 * resolved lazily so a missing secret fails loudly at first use rather than
 * silently weakening auth.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET is not set — refusing to sign sessions with a known key in production.",
      );
    }
    return new TextEncoder().encode("dev-insecure-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  expiresAt: Date;
  sessionVersion?: number;
};

export async function encrypt(payload: SessionPayload) {
  return new SignJWT({ userId: payload.userId, sessionVersion: payload.sessionVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(payload.expiresAt.getTime() / 1000))
    .sign(getSecretKey());
}

export const decrypt = cache(async (session: string | undefined = "") => {
  try {
    const { payload } = await jwtVerify(session, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (!db || typeof payload.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.userId)) return null;
    const [user] = await db.select({ sessionVersion: users.sessionVersion, suspendedAt: users.suspendedAt })
      .from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user || user.suspendedAt || !sessionVersionMatches(payload.sessionVersion, user.sessionVersion)) return null;
    return { userId: payload.userId, sessionVersion: user.sessionVersion };
  } catch {
    return null;
  }
});

export async function createSession(userId: string, expectedVersion?: number) {
  if (!db) throw new Error("Database unavailable.");
  const [user] = await db.select({ sessionVersion: users.sessionVersion, suspendedAt: users.suspendedAt })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.suspendedAt) throw new Error("Account unavailable.");
  if (expectedVersion !== undefined && user.sessionVersion !== expectedVersion) throw new Error("Credentials changed. Sign in again.");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({ userId, expiresAt, sessionVersion: user.sessionVersion });
  const cookieStore = await cookies();
  cookieStore.set("session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export async function getSession() {
  const sessionCookie = (await cookies()).get("session")?.value;
  return decrypt(sessionCookie);
}
