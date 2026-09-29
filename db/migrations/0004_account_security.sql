-- Existing emails are deliberately NOT marked verified. Administrator access
-- moves to explicit ADMIN_USER_IDS; never infer ownership from an email string.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
-- Fail visibly if legacy case-only duplicate emails exist; never merge users.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_casefold_unique ON users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify-email', 'reset-password')),
    email TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT account_tokens_user_purpose_unique UNIQUE (user_id, purpose)
);
CREATE INDEX IF NOT EXISTS account_tokens_expiry_idx ON account_tokens(expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON auth_rate_limits(reset_at);
