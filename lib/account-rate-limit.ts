import "server-only";
import { sql } from "drizzle-orm";
import type { db } from "./db";

/** Atomic counter primitive. Bucket names are supplied by trusted server code,
 * never request fields or environment overrides. Tests use isolated buckets. */
export async function consumeRateLimit(
  database: NonNullable<typeof db>,
  buckets: readonly { key: string; limit: number }[],
  seconds: number,
): Promise<boolean> {
  for (const { key, limit } of buckets) {
    const rows = await database.execute(sql`
      INSERT INTO auth_rate_limits (key, attempts, reset_at)
      VALUES (${key}, 1, now() + ${seconds} * interval '1 second')
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE WHEN auth_rate_limits.reset_at <= now() THEN 1
          ELSE LEAST(auth_rate_limits.attempts + 1, ${limit + 1}) END,
        reset_at = CASE WHEN auth_rate_limits.reset_at <= now()
          THEN now() + ${seconds} * interval '1 second' ELSE auth_rate_limits.reset_at END
      RETURNING attempts
    `);
    if (Number(rows[0]?.attempts) > limit) return false;
  }
  return true;
}
