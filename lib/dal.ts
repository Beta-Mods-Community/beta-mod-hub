import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { decrypt } from "./session";
import { users } from "../db/schema";

/**
 * Data Access Layer — centralizes auth checks and user data access, per the
 * Next.js 16 auth guide. `cache()` memoizes within a single render pass so
 * the session cookie isn't decrypted repeatedly.
 */

export const verifySession = cache(async () => {
  const cookie = (await cookies()).get("session")?.value;
  const session = await decrypt(cookie);

  if (!session?.userId) {
    redirect("/login");
  }

  return { isAuth: true, userId: session.userId };
});

export const getUser = cache(async () => {
  const session = await verifySession();

  if (!db) return null;

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return rows[0] ?? null;
});