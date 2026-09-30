import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@lib/db";
import { cloudPilotEnabled, pilotGateKey } from "@lib/cloud-pilot";
import { objectStorageConfig } from "@lib/storage-config";
import { accountMailConfig } from "@lib/account-mail";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (!db) throw new Error("Not configured");
    await db.execute(sql`select 1`);
    if (cloudPilotEnabled()) {
      objectStorageConfig();
      if (!pilotGateKey() || accountMailConfig()?.mode !== "resend" || process.env.SCAN_DRIVER !== "transloadit" || !process.env.TRANSLOADIT_KEY || !process.env.TRANSLOADIT_SECRET) throw new Error("Not configured");
      // Readiness is DB + configuration, not a claim of external scanner uptime.
      // Each upload must still obtain its own explicit clean result.
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!process.env.SCAN_ENDPOINT) throw new Error("Not configured");
    const endpoint = new URL("/healthz", process.env.SCAN_ENDPOINT);
    const scan = await fetch(endpoint, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!scan.ok || !(await scan.json()).ok) throw new Error("Scan unavailable");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
