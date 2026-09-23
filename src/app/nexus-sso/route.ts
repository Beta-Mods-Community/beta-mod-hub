import { NextResponse, type NextRequest } from "next/server";

import {
  buildAuthorizeUrl,
  NEXUS_SSO_STATE_COOKIE,
  newSsoState,
  ssoConfigured,
} from "@lib/nexus-sso";

/**
 * Entry point for "Sign in with Nexus". Until the app is registered with
 * Nexus (spec: contact support@nexusmods.com before real users), SSO is
 * disabled and this hands back to the login page with `?nexus=unconfigured`.
 */
export async function GET(request: NextRequest) {
  if (!ssoConfigured()) {
    return NextResponse.redirect(new URL("/login?nexus=unconfigured", request.url));
  }

  const state = newSsoState();
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set(NEXUS_SSO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes to complete the flow
  });
  return res;
}