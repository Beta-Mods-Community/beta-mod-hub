-- Scope tester verdicts and bug reports to the build that was actually
-- tested. Existing rows are attached to the newest build for their mod when
-- one exists; rows for a mod that never had a build remain nullable so no
-- historical feedback is discarded.

ALTER TABLE ready_signals
    ADD COLUMN IF NOT EXISTS build_id UUID;

UPDATE ready_signals AS signal
SET build_id = (
    SELECT build.id
    FROM builds AS build
    WHERE build.beta_mod_id = signal.beta_mod_id
    ORDER BY build.uploaded_at DESC, build.id DESC
    LIMIT 1
)
WHERE signal.build_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM builds AS build
      WHERE build.beta_mod_id = signal.beta_mod_id
  );

-- Bug reports already had an optional build_id. Preserve every report while
-- giving old reports the best available provenance.
UPDATE bug_reports AS report
SET build_id = (
    SELECT build.id
    FROM builds AS build
    WHERE build.beta_mod_id = report.beta_mod_id
    ORDER BY build.uploaded_at DESC, build.id DESC
    LIMIT 1
)
WHERE report.build_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM builds AS build
      WHERE build.beta_mod_id = report.beta_mod_id
  );

-- A NOT VALID check is deliberate. It is enforced for every new or updated
-- row but does not reject the migration if a pre-existing vote/report belongs
-- to a mod that never had a build. Such legacy rows remain historical only:
-- current-build queries ignore their NULL build_id.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ready_signals_build_id_required'
          AND conrelid = 'ready_signals'::regclass
    ) THEN
        ALTER TABLE ready_signals
            ADD CONSTRAINT ready_signals_build_id_required
            CHECK (build_id IS NOT NULL) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bug_reports_build_id_required'
          AND conrelid = 'bug_reports'::regclass
    ) THEN
        ALTER TABLE bug_reports
            ADD CONSTRAINT bug_reports_build_id_required
            CHECK (build_id IS NOT NULL) NOT VALID;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ready_signals_build_id_builds_id_fk'
          AND conrelid = 'ready_signals'::regclass
    ) THEN
        ALTER TABLE ready_signals
            ADD CONSTRAINT ready_signals_build_id_builds_id_fk
            FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;
    END IF;
END
$$;

-- The old key allowed only one lifetime verdict per mod/tester. Replacing it
-- lets a tester render a fresh verdict for every build while retaining the
-- earlier rows for reputation/history.
ALTER TABLE ready_signals
    DROP CONSTRAINT IF EXISTS ready_signals_beta_mod_id_tester_id_key;
ALTER TABLE ready_signals
    DROP CONSTRAINT IF EXISTS ready_signals_beta_mod_id_tester_id_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ready_signals_build_id_tester_id_unique'
          AND conrelid = 'ready_signals'::regclass
    ) THEN
        ALTER TABLE ready_signals
            ADD CONSTRAINT ready_signals_build_id_tester_id_unique
            UNIQUE (build_id, tester_id);
    END IF;
END
$$;
