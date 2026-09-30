import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";

const MiB = 1024 * 1024;
export function scanBudgetCharge(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 8 * MiB) throw new Error("Invalid scan size");
  // Envelope + input/output/hash overhead, rounded up. Provider free-plan hard
  // stop remains the final limit; this is a deliberately conservative app cap.
  return Math.ceil((bytes + 1024) / MiB) * 3;
}

export async function reserveCloudScanUsage(bytes: number): Promise<boolean> {
  if (!db) return false;
  try {
    const charge = scanBudgetCharge(bytes);
    const configured = Number(process.env.TRANSLOADIT_MONTHLY_BUDGET_MIB ?? 3072);
    const limit = Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, 3072) : 3072;
    if (charge > limit) return false;
    const rows = await db.execute(sql`
      INSERT INTO auth_rate_limits (key, attempts, reset_at)
      VALUES ('cloud-scan:month', ${charge},
        (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC')
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE WHEN auth_rate_limits.reset_at <= now() THEN ${charge}
          ELSE auth_rate_limits.attempts + ${charge} END,
        reset_at = (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
      WHERE auth_rate_limits.reset_at <= now() OR auth_rate_limits.attempts + ${charge} <= ${limit}
      RETURNING attempts
    `);
    // No refund: a timeout can still have consumed provider processing allowance.
    return rows.length === 1;
  } catch { return false; }
}
