import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cloudPilotEnabled, makePilotCookie, PILOT_COOKIE, pilotGateKey, safePilotReturnTo } from "@lib/cloud-pilot";
import { consumeRateLimit } from "@lib/account-rate-limit";
import { db } from "@lib/db";
import { sitePresentation } from "@lib/site-presentation";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
// A native form POST under no-referrer sends Origin: null, which our CSRF
// check correctly rejects. Keep its real HTTPS origin without disclosing the
// returnTo path/query (which can contain an email-verification token).
const formHeaders = { ...headers, "Referrer-Policy": "strict-origin", "Content-Type": "text/html; charset=utf-8" };
export async function GET() {
  if (!cloudPilotEnabled()) return new Response("Not found", { status: 404 });
  if (!pilotGateKey()) return new Response("The private pilot is not configured yet.", { status: 503, headers });
  return new Response(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private beta · Beta Mods</title>
<meta property="og:type" content="website"><meta property="og:title" content="${sitePresentation.title}">
<meta property="og:description" content="${sitePresentation.description}"><meta property="og:image" content="${sitePresentation.image}">
<meta property="og:image:alt" content="Beta Mods beta symbol"><meta name="twitter:card" content="summary">
<style>
*{box-sizing:border-box}body{margin:0;background:#0a0e12;color:#edf1f5;font:16px system-ui;display:grid;min-height:100dvh;place-items:center;padding:40px 24px}
main{width:min(100%,440px)}.brand{display:flex;align-items:center;gap:12px;color:#edf1f5;font-weight:650}.mark{display:grid;place-items:center;width:36px;height:36px;border:1px solid #4ad9ed;border-radius:6px;background:#102229;color:#8be7f3;font-size:24px;font-weight:900}
h1{margin:40px 0 16px;font-size:clamp(30px,6vw,40px);line-height:1.15;letter-spacing:-.035em}p{color:#9baab9;line-height:1.7}label{display:block;margin-top:28px;font-size:14px;font-weight:600}
input,button{width:100%;min-height:48px;padding:12px 14px;margin-top:10px;border-radius:6px;border:1px solid #536677;font:inherit}input{background:#0d1218;color:#edf1f5}button{margin-top:18px;background:#4ad9ed;border-color:#4ad9ed;color:#07171d;font-weight:650;cursor:pointer}button:hover{background:#8be7f3;border-color:#8be7f3}input:focus-visible,button:focus-visible{outline:2px solid #4ad9ed;outline-offset:3px}.note{margin-top:28px;padding-top:20px;border-top:1px solid #26323e;font-size:13px}
</style></head><body><main>
<p class="brand"><span class="mark" aria-hidden="true">β</span>Beta Mods</p>
<h1>Private beta</h1><p>Enter the access code shared with your tester group, then sign in or create an account.</p>
<form method="post"><label for="code">Tester access code</label><input id="code" name="code" type="password" required maxlength="256" autocomplete="off"><button>Continue</button></form>
<p class="note">Uploads are limited to small files during this beta.</p>
</main></body></html>`, { headers: formHeaders });
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
