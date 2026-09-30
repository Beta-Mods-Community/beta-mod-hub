import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cloudPilotEnabled, makePilotCookie, PILOT_COOKIE, pilotGateKey, safePilotReturnTo } from "@lib/cloud-pilot";
import { consumeRateLimit } from "@lib/account-rate-limit";
import { db } from "@lib/db";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
export async function GET() {
  if (!cloudPilotEnabled()) return new Response("Not found", { status: 404 });
  if (!pilotGateKey()) return new Response("The private pilot is not configured yet.", { status: 503, headers });
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private pilot · Beta Mods</title><style>body{margin:0;background:#090b0d;color:#edf4f6;font:16px system-ui;display:grid;min-height:100vh;place-items:center}main{width:min(420px,85vw)}h1{font-size:2rem}p{color:#a8b8c1;line-height:1.6}label{display:block;margin-top:24px}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:10px;border-radius:6px;border:1px solid #34434a;font:inherit}input{background:#11191e;color:white}button{background:#42dcf4;color:#091317;font-weight:650;cursor:pointer}</style><main><p>Beta Mods</p><h1>Private tester pilot</h1><p>Enter the access code shared with your tester group. You will then sign in or create your own account.</p><form method="post"><label for="code">Tester access code</label><input id="code" name="code" type="password" required maxlength="256" autocomplete="off"><button>Continue</button></form><p>Uploads are limited to small files during this pilot.</p></main></html>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request) {
  if (!cloudPilotEnabled() || !pilotGateKey() || !db) return new Response("Pilot unavailable.", { status: 503, headers });
  let expectedOrigin: string;
  try { expectedOrigin = new URL(process.env.APP_URL ?? "").origin; } catch { return new Response("Pilot unavailable.", { status: 503, headers }); }
  if (request.headers.get("origin") !== expectedOrigin || request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") return new Response("Invalid request.", { status: 403, headers });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    if (!request.body) return new Response("Invalid request.", { status: 400, headers });
    for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > 4096) return new Response("Request too large.", { status: 413, headers });
      chunks.push(chunk);
    }
    const supplied = new URLSearchParams(Buffer.concat(chunks).toString("utf8")).get("code") ?? "";
    const hash = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(hash(supplied), hash(process.env.PILOT_ACCESS_KEY!))) {
      // Invalid-code traffic must not lock out holders of the real random code.
      const allowed = await consumeRateLimit(db, [{ key: "pilot-access:global", limit: 60 }], 900);
      return new Response(allowed ? "That access code is not valid. Go back and try again." : "Too many invalid access attempts. Try again later.", { status: allowed ? 403 : 429, headers });
    }
    const destination = safePilotReturnTo(new URL(request.url).searchParams.get("returnTo"));
    const response = NextResponse.redirect(new URL(destination, expectedOrigin), 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(PILOT_COOKIE, await makePilotCookie(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 86400 });
    return response;
  } catch { return new Response("Pilot access is temporarily unavailable.", { status: 503, headers }); }
}
