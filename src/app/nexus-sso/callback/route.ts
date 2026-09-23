import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@lib/db";
import {
  exchangeCodeForToken,
  fetchSsoProfile,
  NEXUS_SSO_STATE_COOKIE,
} from "@lib/nexus-sso";
import { setUserNexusCredential } from "@lib/nexus-keys";
import { createSession } from "@lib/session";
import { users } from "@/db/schema";

/**
 * OAuth2 callback for Nexus SSO. SCAFFOLD — not yet validated against a live
 * Nexus registration (see lib/nexus-sso.ts): profile field names are the
 * common OAuth2 conventions and get reconciled with Nexus's actual userinfo
 * response once the app is registered.
 *
 * Flow: verify state (CSRF) -> exchange code for tokens -> fetch profile ->
 * upsert the user by `nexus_user_id` -> store the access token encrypted
 * (nexus_links, per the spec's "capture the per-user API key") -> session.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(NEXUS_SSO_STATE_COOKIE)?.value;

  const fail = () => {
    const res = NextResponse.redirect(new URL("/login?nexus=error", request.url));
    res.cookies.delete(NEXUS_SSO_STATE_COOKIE);
    return res;
  };

  if (!code || !state || state !== storedState) return fail();

  try {
    const tokens = await exchangeCodeForToken(code);
    const profile = await fetchSsoProfile(tokens.accessToken);

    if (!db) throw new Error("Database isn't configured.");

    let userId: string | undefined;
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.nexusUserId, profile.id))
      .limit(1);

    if (existing[0]) {
      userId = existing[0].id;
      await db
        .update(users)
        .set({
          displayName: profile.displayName ?? undefined,
          avatarUrl: profile.avatarUrl ?? undefined,
        })
        .where(eq(users.id, userId));
    } else {
      const inserted = await db
        .insert(users)
        .values({
          nexusUserId: profile.id,
          displayName: profile.displayName ?? `Nexus user ${profile.id.slice(0, 8)}`,
          avatarUrl: profile.avatarUrl,
        })
        .returning({ id: users.id });
      userId = inserted[0]?.id;
    }
    if (!userId) throw new Error("Could not create the user.");

    // Per-user credential at rest (never a shared app-wide key). A failure
    // here shouldn't block sign-in — the account just won't have a key yet.
    await setUserNexusCredential(userId, tokens.accessToken).catch(() => {});

    await createSession(userId);
    const res = NextResponse.redirect(new URL("/dashboard", request.url));
    res.cookies.delete(NEXUS_SSO_STATE_COOKIE);
    return res;
  } catch {
    return fail();
  }
}