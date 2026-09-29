import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@lib/db";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (!db || !process.env.SCAN_ENDPOINT) throw new Error("Not configured");
    await db.execute(sql`select 1`);
    const endpoint = new URL("/healthz", process.env.SCAN_ENDPOINT);
    const scan = await fetch(endpoint, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!scan.ok || !(await scan.json()).ok) throw new Error("Scan unavailable");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
