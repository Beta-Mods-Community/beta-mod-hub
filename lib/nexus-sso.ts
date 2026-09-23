import "server-only";

import { randomBytes } from "node:crypto";

/**
 * Nexus SSO scaffold (spec "Nexus integration" -> Auth).
 *
 * STATUS: NOT TESTED. This is a generic OAuth2 Authorization Code flow with
 * placeholder endpoints. Nothing here has been validated against Nexus's live
 * SSO — the authorize/token/userinfo URLs and the profile field names MUST be
 * confirmed against Nexus's OAuth/SSO documentation after the app is
 * registered with them (spec: "auth via SSO; register the app before real
 * users"). Until then the flow is disabled: /nexus-sso redirects to login
 * with `?nexus=unconfigured`, and local email+password remains the auth path.
 *
 * No credentials are invented here. All config comes from env vars:
 *   NEXUS_SSO_CLIENT_ID / NEXUS_SSO_CLIENT_SECRET  (from registration)
 *   NEXUS_SSO_REDIRECT_URI                          (this app's callback URL)
 *   NEXUS_SSO_AUTHORIZE_URL / NEXUS_SSO_TOKEN_URL / NEXUS_SSO_USERINFO_URL
 *   NEXUS_SSO_SCOPES
 */

export const NEXUS_SSO_STATE_COOKIE = "nexus_sso_state";

export function ssoConfigured(): boolean {
  return Boolean(
    process.env.NEXUS_SSO_CLIENT_ID &&
      process.env.NEXUS_SSO_CLIENT_SECRET &&
      process.env.NEXUS_SSO_REDIRECT_URI &&
      process.env.NEXUS_SSO_AUTHORIZE_URL &&
      process.env.NEXUS_SSO_TOKEN_URL &&
      process.env.NEXUS_SSO_USERINFO_URL,
  );
}

export class SsoUnconfiguredError extends Error {
  constructor() {
    super("Nexus SSO is not configured — the app is not registered with Nexus yet.");
    this.name = "SsoUnconfiguredError";
  }
}

export class SsoExchangeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SsoExchangeError";
    this.status = status;
  }
}

type SsoConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scopes: string;
};

export function getSsoConfig(): SsoConfig {
  if (!ssoConfigured()) throw new SsoUnconfiguredError();
  return {
    clientId: process.env.NEXUS_SSO_CLIENT_ID!,
    clientSecret: process.env.NEXUS_SSO_CLIENT_SECRET!,
    redirectUri: process.env.NEXUS_SSO_REDIRECT_URI!,
    authorizeUrl: process.env.NEXUS_SSO_AUTHORIZE_URL!,
    tokenUrl: process.env.NEXUS_SSO_TOKEN_URL!,
    userinfoUrl: process.env.NEXUS_SSO_USERINFO_URL!,
    scopes: process.env.NEXUS_SSO_SCOPES ?? "profile",
  };
}

export function newSsoState(): string {
  return randomBytes(24).toString("hex");
}

export function buildAuthorizeUrl(state: string): string {
  const cfg = getSsoConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scopes,
    state,
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

export type SsoTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
};

/**
 * Exchanges the authorization code for tokens via a form-encoded POST to the
 * token endpoint (standard OAuth2 authorization-code flow).
 */
export async function exchangeCodeForToken(code: string): Promise<SsoTokens> {
  const cfg = getSsoConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  let res: Response;
  try {
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    throw new SsoExchangeError(0, err instanceof Error ? err.message : "SSO token request failed");
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new SsoExchangeError(res.status, "SSO token exchange failed");
  }
  const accessToken = data.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new SsoExchangeError(200, "SSO response was missing access_token");
  }

  return {
    accessToken,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : null,
  };
}

/**
 * Fetches the user profile with the access token. The field names below are
 * the common OAuth2/OIDC conventions — they must be reconciled with Nexus's
 * actual userinfo response once registered (see module doc).
 */
export async function fetchSsoProfile(
  accessToken: string,
): Promise<{ id: string; displayName: string | null; avatarUrl: string | null }> {
  const cfg = getSsoConfig();
  const res = await fetch(cfg.userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new SsoExchangeError(res.status, "SSO userinfo request failed");

  const profile = (await res.json()) as Record<string, unknown>;
  const id =
    typeof profile.id === "string"
      ? profile.id
      : typeof profile.user_id === "string"
        ? profile.user_id
        : typeof profile.sub === "string"
          ? profile.sub
          : null;
  if (!id) throw new SsoExchangeError(200, "SSO profile was missing a user id");

  const str = (key: string): string | null =>
    typeof profile[key] === "string" ? (profile[key] as string) : null;

  return {
    id,
    displayName: str("name") ?? str("display_name") ?? str("username"),
    avatarUrl: str("avatar") ?? str("avatar_url") ?? str("picture"),
  };
}