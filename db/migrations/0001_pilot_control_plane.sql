-- 0001: pilot control plane.
--
-- Adds the byte ledger, the upload allowlist and the admin runtime switch that
-- the closed beta needs. See the "Pilot control plane" section of schema.sql
-- for what each table is for — this file is the same thing, made re-runnable.
--
-- Apply to the Neon **dev** branch only:
--   node scripts/apply-migrations.mjs
--
-- Re-runnable on purpose: the type creation is guarded and every table and
-- index is created IF NOT EXISTS, so running it twice is a no-op rather than
-- an error. It is NOT reversible — see the rollback note at the bottom.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'storage_reservation_state') THEN
        CREATE TYPE storage_reservation_state AS ENUM ('held', 'stored', 'released');
    END IF;
END
$$;

-- Byte ledger behind the storage caps. See lib/storage-usage.ts.
CREATE TABLE IF NOT EXISTS storage_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Deleting a build (or the mod that owns it) releases its stored bytes.
    build_id UUID REFERENCES builds(id) ON DELETE CASCADE,
    bytes BIGINT NOT NULL CHECK (bytes > 0),
    state storage_reservation_state NOT NULL DEFAULT 'held',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS storage_reservations_user_id_idx
    ON storage_reservations(user_id);
CREATE INDEX IF NOT EXISTS storage_reservations_state_idx
    ON storage_reservations(state);

-- Who may upload while PILOT_MODE=on. An empty table means nobody uploads.
CREATE TABLE IF NOT EXISTS pilot_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    approved_by TEXT,
    note TEXT,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-flippable switches. A missing row means the default (uploads on), so
-- the site never boots frozen because this table is empty.
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rollback (only while the pilot is still private, and only if you accept
-- losing the ledger history):
--   DROP TABLE app_settings, pilot_accounts, storage_reservations;
--   DROP TYPE storage_reservation_state;
-- Existing builds and their stored objects are untouched by a rollback — but
-- without the ledger, no upload can be authorised, so the app will refuse them
-- all until this migration is applied again.
