import "server-only";
import { desc, eq } from "drizzle-orm";
import { builds, readySignals } from "../db/schema";
import { assertEditableMod, lockModForMutation, ModMutationError, type ModTransaction } from "./mod-lifecycle";
import { validateVoteBuild } from "./feedback-policy";

/** Shared by the server action and the real Postgres race tests. */
export async function recordBuildVote(tx: ModTransaction, input: { betaModId: string; displayedBuildId: string; testerId: string; isReady: boolean }) {
  const { betaModId, displayedBuildId, testerId, isReady } = input;
  const mod = await lockModForMutation(tx, betaModId);
  assertEditableMod(mod);
  if (mod.ownerId === testerId) throw new ModMutationError("Authors cannot vote on their own mods.");
  if (typeof isReady !== "boolean") throw new ModMutationError("Choose ready or not ready.");
  const [latest] = await tx.select({ id: builds.id }).from(builds).where(eq(builds.betaModId, betaModId))
    .orderBy(desc(builds.uploadedAt), desc(builds.id)).limit(1);
  const invalid = validateVoteBuild(displayedBuildId, latest?.id);
  if (invalid) throw new ModMutationError(invalid);
  await tx.insert(readySignals).values({ betaModId, buildId: displayedBuildId, testerId, isReady })
    .onConflictDoUpdate({ target: [readySignals.buildId, readySignals.testerId], set: { isReady, createdAt: new Date() } });
}
