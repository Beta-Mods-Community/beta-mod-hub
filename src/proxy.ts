import { NextResponse, type NextRequest } from "next/server";
import { cloudPilotEnabled, PILOT_COOKIE, validPilotCookie } from "@lib/cloud-pilot";

export async function proxy(request: NextRequest) {
  if (!cloudPilotEnabled()) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (["GET", "HEAD"].includes(request.method) && (path.startsWith("/_next/static/") || path.startsWith("/images/") || path === "/favicon.ico")) return NextResponse.next();
  if (path === "/pilot-access" || (path === "/api/health" && ["GET", "HEAD"].includes(request.method))) return NextResponse.next();
  if (!await validPilotCookie(request.cookies.get(PILOT_COOKIE)?.value)) {
    if (!["GET", "HEAD"].includes(request.method)) return new NextResponse("Pilot access required.", { status: 401, headers: { "Cache-Control": "no-store" } });
    let gate: URL;
    try {
      gate = new URL("/pilot-access", process.env.APP_URL);
      if (gate.protocol !== "https:" || gate.username || gate.password) throw new Error();
    } catch { return new NextResponse("Pilot unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } }); }
    gate.searchParams.set("returnTo", path + request.nextUrl.search);
    const response = NextResponse.redirect(gate);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/:path*"] };
