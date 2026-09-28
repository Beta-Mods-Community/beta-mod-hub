-- 0003: mod media — screenshots/gallery for a beta mod page.
--
-- Adds the mod_media table (scanned, published images), the scan-state
-- vocabulary, and a nullable media_id on the storage ledger so media bytes are
-- reserved and released through the exact same quota path as build archives.
--
-- Apply to the Neon **dev** branch only:
--   node scripts/apply-migrations.mjs
--
-- Re-runnable on purpose: the type creation is guarded and every table,
-- constraint and index is created IF NOT EXISTS, so running it twice is a
-- no-op rather than an error. It is NOT reversible — see the rollback note
-- at the bottom.

-- Scan state carried on every stored media row. The pipeline is synchronous
-- quarantine -> ClamAV -> publish, so only 'clean' rows are ever written; the
-- 'rejected' value exists so the column is a real contract and a future
-- async/quarantine-visible design can record history without a schema change.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_scan_state') THEN
        CREATE TYPE media_scan_state AS ENUM ('clean', 'rejected');
    END IF;
END
$$;

-- One row per published screenshot/hero (see lib/mod-media.ts for the actions
-- that manage these rows). Rows are created ONLY after a clean scan and only
-- once the bytes are in final storage, so the table never contains an object
-- that has not been cleared for serving.
CREATE TABLE IF NOT EXISTS mod_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beta_mod_id UUID NOT NULL REFERENCES beta_mods(id) ON DELETE CASCADE,
    -- Final storage key (R2 in production): media/<modId>/<uuid>.<ext>.
    object_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    -- Gallery order, ascending. New uploads get max(position)+1; moves swap.
    position INTEGER NOT NULL DEFAULT 0,
    caption TEXT CHECK (caption IS NULL OR char_length(caption) <= 200),
    -- At most one per mod (partial unique index below). The hero is what
    -- Browse cards show and the gallery starts on.
    is_hero BOOLEAN NOT NULL DEFAULT false,
    scan_state media_scan_state NOT NULL DEFAULT 'clean',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mod_media_beta_mod_id_idx
    ON mod_media(beta_mod_id);

-- Gallery positions are unique within a mod, so sorting is stable and a move
-- is an unambiguous swap.
CREATE UNIQUE INDEX IF NOT EXISTS mod_media_position_unique
    ON mod_media(beta_mod_id, position);

-- Exactly one hero per mod, enforced by the database rather than by the action
-- that sets it (the action still clears the rest, transactionally).
CREATE UNIQUE INDEX IF NOT EXISTS mod_media_one_hero_per_mod
    ON mod_media(beta_mod_id) WHERE is_hero;

-- The byte ledger gains a media handle so deleting a media row releases its
-- stored bytes the same way deleting a build does. build_id stays for builds;
-- media_id stays for media; both are nullable because an upload holds a
-- reservation before the row it will settle against exists.
ALTER TABLE storage_reservations
    ADD COLUMN IF NOT EXISTS media_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'storage_reservations_media_id_fk'
          AND conrelid = 'storage_reservations'::regclass
    ) THEN
        ALTER TABLE storage_reservations
            ADD CONSTRAINT storage_reservations_media_id_fk
            FOREIGN KEY (media_id) REFERENCES mod_media(id) ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS storage_reservations_media_id_idx
    ON storage_reservations(media_id);

-- Rollback (only while the pilot is still private, and only if you accept
-- losing the media rows):
--   DROP TABLE mod_media;                -- drops its reservations too
--   DROP TYPE media_scan_state;
--   ALTER TABLE storage_reservations DROP COLUMN media_id;
-- Stored R2 objects under media/<modId>/ would become orphans — remove them
-- with the inventory tool before rolling back, or leave them documented as
-- quarrantine-scratch to be swept.