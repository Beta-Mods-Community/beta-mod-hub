import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * Stateless sessions (JWT in an httpOnly cookie) — the pattern from the
 * Next.js 16 auth guide. Swaps to Nexus SSO in phase 3; the cookie+session
 * shape stays the same.
 */

const secretKey = process.env.SESSION_SECRET ?? "dev-insecure-secret-change-me";
const encodedKey = new TextEncoder().encode(secretKey);

export type SessionPayload = {
  userId: string;
  expiresAt: Date;
};

export async function encrypt(payload: SessionPayload) {
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

export async function decrypt(session: string | undefined = "") {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as { userId: string };
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({ userId, expiresAt });
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