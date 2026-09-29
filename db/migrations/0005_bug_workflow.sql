-- Structured author responses, reporter retests, private scanned attachments.
CREATE TABLE IF NOT EXISTS bug_report_workflow (
  report_id uuid PRIMARY KEY REFERENCES bug_reports(id) ON DELETE CASCADE,
  author_response text,
  responded_at timestamptz,
  retest_status text NOT NULL DEFAULT 'not-requested'
    CHECK (retest_status IN ('not-requested', 'requested', 'resolved', 'still-present')),
  retest_build_id uuid REFERENCES builds(id) ON DELETE SET NULL,
  retest_notes text,
  retested_at timestamptz
);

CREATE TABLE IF NOT EXISTS bug_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  beta_mod_id uuid NOT NULL REFERENCES beta_mods(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES users(id),
  reservation_id uuid NOT NULL UNIQUE REFERENCES storage_reservations(id),
  object_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  scan_state text NOT NULL DEFAULT 'clean' CHECK (scan_state = 'clean'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bug_attachments_mod_idx ON bug_attachments(beta_mod_id);
