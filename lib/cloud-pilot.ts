import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { isCloudPilot } from "./pilot";

export const CLOUD_UPLOAD_BYTES = 8 * 1024 * 1024;
export const CLOUD_IMAGE_PIXELS = 8 * 1024 * 1024;
export const PILOT_COOKIE = "betamods-pilot";
export const cloudPilotEnabled = isCloudPilot;

export function safePilotReturnTo(value: string | null): string {
  if (!value || value.length > 4096 || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/";
  const url = new URL(value, "https://pilot.invalid");
  if (url.origin !== "https://pilot.invalid" || url.pathname === "/pilot-access") return "/";
  return url.pathname + url.search;
}

export function pilotGateKey(env: NodeJS.ProcessEnv = process.env): Uint8Array | null {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || !env.PILOT_ACCESS_KEY || env.PILOT_ACCESS_KEY.length < 32) return null;
  // Rotating either secret invalidates gate cookies. Never use this as account auth.
  return createHash("sha256").update(`beta-mods:pilot:${env.SESSION_SECRET}:${env.PILOT_ACCESS_KEY}`).digest();
}

export async function makePilotCookie(env: NodeJS.ProcessEnv = process.env) {
  const key = pilotGateKey(env);
  if (!key) throw new Error("Pilot access is not configured.");
  return new SignJWT({ gate: true }).setProtectedHeader({ alg: "HS256" })
    .setAudience("betamods-pilot").setIssuedAt().setExpirationTime("24h").sign(key);
}

export async function validPilotCookie(token: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  const key = pilotGateKey(env);
  if (!key || !token || token.length > 2048) return false;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], audience: "betamods-pilot" });
    return payload.gate === true;
  } catch { return false; }
}
