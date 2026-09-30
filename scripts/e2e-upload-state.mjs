/**
 * Snapshot only the shared controls this dev-only upload harness changes.
 * Timestamp text preserves PostgreSQL precision when the original rows return.
 * Importing this helper never connects to a database or mutates anything.
 *
 * @param {(strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<Record<string, unknown>>>} sql
 * @param {string} ownerId
 * @param {boolean} pilotMode
 */
export async function captureUploadTestState(sql, ownerId, pilotMode) {
  const switchRows = await sql`select key, value, updated_at::text as updated_at
    from app_settings where key = 'uploads_enabled' limit 1`;
  const approvalRows = pilotMode
    ? await sql`select id, user_id, approved_by, note, approved_at::text as approved_at
        from pilot_accounts where user_id = ${ownerId} limit 1`
    : [];
  return {
    ownerId,
    pilotMode,
    uploadsEnabled: switchRows[0] ?? null,
    approval: approvalRows[0] ?? null,
  };
}

/**
 * Always attempt switch restoration, even if restoring an approval fails.
 * Missing rows stay missing; existing approval metadata is not regenerated.
 *
 * @param {Parameters<typeof captureUploadTestState>[0]} sql
 * @param {Awaited<ReturnType<typeof captureUploadTestState>>} snapshot
 */
export async function restoreUploadTestState(sql, snapshot) {
  const failures = [];
  if (snapshot.pilotMode) {
    try {
      if (snapshot.approval) {
        const row = snapshot.approval;
        await sql`insert into pilot_accounts (id, user_id, approved_by, note, approved_at)
          values (${row.id}, ${row.user_id}, ${row.approved_by}, ${row.note}, ${row.approved_at}::timestamptz)
          on conflict (user_id) do update set id = excluded.id,
            approved_by = excluded.approved_by, note = excluded.note, approved_at = excluded.approved_at`;
      } else {
        await sql`delete from pilot_accounts where user_id = ${snapshot.ownerId}`;
      }
    } catch {
      failures.push(new Error("pilot approval restoration failed"));
    }
  }
  try {
    if (snapshot.uploadsEnabled) {
      const row = snapshot.uploadsEnabled;
      await sql`insert into app_settings (key, value, updated_at)
        values ('uploads_enabled', ${row.value}, ${row.updated_at}::timestamptz)
        on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`;
    } else {
      await sql`delete from app_settings where key = 'uploads_enabled'`;
    }
  } catch {
    failures.push(new Error("upload switch restoration failed"));
  }
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join("; "));
}

/** Only these drivers have verified cleanup support in the dev rehearsals. */
export function assertE2eStorageDriver(storageDriver) {
  if (!["local", "r2"].includes(storageDriver)) throw new Error("Expected storage driver local or r2");
}

/** Expected successful checks, not a count inflated by mutually exclusive paths. */
export function expectedUploadCheckCount(storageDriver, pilotMode) {
  assertE2eStorageDriver(storageDriver);
  return (storageDriver === "r2" ? 23 : 19) + (pilotMode ? 6 : 0);
}
