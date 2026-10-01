import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "../db/schema";
import { allowsUnverifiedLocalAccounts } from "./account-policy";

export type AccountTransaction = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0];

/** Check account state again inside publication transactions, not only before scanning. */
export async function getAccountWriteError(userId: string, transaction?: AccountTransaction): Promise<string | null> {
  const executor = transaction ?? db;
  if (!executor) return "The database is temporarily unavailable.";
  const query = executor.select({ emailVerifiedAt: users.emailVerifiedAt, suspendedAt: users.suspendedAt })
    .from(users).where(eq(users.id, userId)).limit(1);
  // Hold the account row stable until publication commits. Suspension's UPDATE
  // waits for this shared lock, or wins first and is observed by this check.
  const [user] = await (transaction ? query.for("share") : query);
  if (!user || user.suspendedAt) return "This account is unavailable.";
  if (!user.emailVerifiedAt && !allowsUnverifiedLocalAccounts()) {
    return "Verify your email in Account settings before posting or uploading.";
  }
  return null;
}
