import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Source guard, not a substitute for the DB regression. Importing the ledger
// here would load DATABASE_URL; these checks deliberately need no credentials.
const source = readFileSync(path.join(import.meta.dirname, "..", "lib", "storage-usage.ts"), "utf8");
const reserve = source.slice(source.indexOf("export async function reserveStorage("), source.indexOf("export async function markReservationStored("));

test("automatic reservation pruning only deletes explicitly released history", () => {
  const deletes = reserve.match(/\.delete\(storageReservations\)[\s\S]*?;/g) ?? [];
  assert.equal(deletes.length, 1, "adding ledger deletion requires review of crash-held charges");
  assert.match(deletes[0], /eq\(storageReservations\.state, "released"\)/);
  assert.match(deletes[0], /lt\(storageReservations\.createdAt, historyBefore\)/);
  assert.doesNotMatch(deletes[0], /"held"|"stored"/);
});

test("reservation admission does not expire held charges through the legacy TTL", () => {
  assert.doesNotMatch(reserve, /\breservationTtlMinutes\b|\bstaleBefore\b/);
  assert.match(reserve, /filter \(where \$\{storageReservations\.state\} = 'held'\)/);
});

for (const file of ["build-uploads.ts", "feedback.ts"]) {
  test(`${file} retains an unacknowledged PUT charge despite successful cleanup`, () => {
    const upload = readFileSync(path.join(import.meta.dirname, "..", "lib", file), "utf8");
    assert.match(upload, /let storageCompleted = false;/);
    assert.match(upload, /storageAttempted = true;\s*await promoteQuarantine\(quarantineKey, finalKey\);\s*storageCompleted = true;/);
    assert.match(upload, /if \((?:reservationId && )?removed && \(!storageAttempted \|\| storageCompleted\)\) await releaseReservation\(reservationId\);\s*else (?:if \(reservationId\) )?await retainReservationForCleanup\(reservationId\);/);
  });
}
