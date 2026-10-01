import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { readAdminUserIds } from "./pilot";
import { getAccountWriteError } from "./account-write-access";
import { getSession } from "./session";
import { users } from "../db/schema";

/**
 * Who is calling, and are they the owner of this site.
 *
 * Administrator IDs are explicitly configured in ADMIN_USER_IDS. Email
 * strings never grant administrative access. An unset or empty list means there
 * is no admin console at all — `isAdmin` is false for everyone, and the admin
 * page refuses rather than defaulting to open.
 *
 * Cached per render, so the header and the admin page share one lookup.
 */
export const getViewer = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  let email: string | null = null;
  if (db) {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    email = rows[0]?.email ?? null;
  }

  const admins = readAdminUserIds();
  return {
    userId: session.userId,
    email,
    isAdmin: admins.has(session.userId.toLowerCase()),
  };
});

/** Gate for admin pages and admin actions. Non-admins are redirected home. */
export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) redirect("/");
  return viewer;
}

export { getAccountWriteError } from "./account-write-access";
export type { AccountTransaction } from "./account-write-access";

export async function requireVerifiedAccount() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const error = await getAccountWriteError(viewer.userId);
  if (error) redirect("/account");
  return viewer;
}
