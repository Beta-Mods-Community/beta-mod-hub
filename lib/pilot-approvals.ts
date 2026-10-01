import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { pilotAccounts, users } from "../db/schema";

export type PilotApprovalResult =
  | { outcome: "unavailable" }
  | { outcome: "missing" }
  | { outcome: "existing"; displayName: string }
  | { outcome: "approved"; displayName: string }
  | { outcome: "full"; approved: number };

/** All grants serialize the count and insert, including approvals of different
 * users. The configured pilot cap must hold across concurrent admin requests. */
export async function approvePilotUploader(input: {
  email: string; note: string | null; approvedBy: string; maxApproved: number;
}): Promise<PilotApprovalResult> {
  if (!db) return { outcome: "unavailable" };
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('pilot-account-approvals'))`);
    const [user] = await tx.select({ id: users.id, displayName: users.displayName }).from(users)
      .where(sql`lower(${users.email}) = ${input.email}`).limit(1);
    if (!user) return { outcome: "missing" };
    const [existing] = await tx.select({ userId: pilotAccounts.userId }).from(pilotAccounts)
      .where(eq(pilotAccounts.userId, user.id)).limit(1);
    if (existing) return { outcome: "existing", displayName: user.displayName };
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(pilotAccounts);
    if (count.count >= input.maxApproved) return { outcome: "full", approved: count.count };
    await tx.insert(pilotAccounts).values({ userId: user.id, approvedBy: input.approvedBy, note: input.note });
    return { outcome: "approved", displayName: user.displayName };
  });
}
