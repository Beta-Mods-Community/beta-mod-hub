BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE beta_mods ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
CREATE TABLE IF NOT EXISTS mod_follows (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beta_mod_id uuid NOT NULL REFERENCES beta_mods(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, beta_mod_id)
);
CREATE INDEX IF NOT EXISTS mod_follows_mod_idx ON mod_follows(beta_mod_id);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL, href text NOT NULL, read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_date_idx ON notifications(user_id, created_at);
CREATE TABLE IF NOT EXISTS content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), beta_mod_id uuid NOT NULL REFERENCES beta_mods(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason text NOT NULL,
  resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(reporter_id, beta_mod_id)
);
CREATE TABLE IF NOT EXISTS moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES users(id),
  target_id uuid NOT NULL, action text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
