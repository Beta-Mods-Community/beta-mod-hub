-- Initial schema for Beta Mod Hub. Matches the Data Model section of
-- beta-mod-hub-spec.md. Starting point, not a locked contract — adjust
-- types/constraints as the app evolves.

CREATE TYPE beta_mod_status AS ENUM ('alpha', 'beta', 'rc', 'promoted', 'abandoned');
CREATE TYPE bug_severity AS ENUM ('minor', 'major', 'blocking');
CREATE TYPE bug_status AS ENUM ('open', 'acknowledged', 'fixed');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nexus_user_id TEXT UNIQUE,
    -- Local sign-in fallback for the pre-SSO period and for testers who
    -- don't want to link Nexus. Null for Nexus-SSO-only accounts.
    email TEXT UNIQUE,
    password_hash TEXT,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    -- reputation_score is derived at query time from ready_signals +
    -- bug_reports, not stored here — see spec (lib/reputation.ts).
);

CREATE TABLE beta_mods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT, -- plain/markdown, not BBCode
    game TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    status beta_mod_status NOT NULL DEFAULT 'alpha',
    -- Set when the author confirms promotion: the live Nexus page URL.
    -- That page is the mod's home once promoted; this beta page links to it.
    nexus_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beta_mod_id UUID NOT NULL REFERENCES beta_mods(id) ON DELETE CASCADE,
    version_label TEXT NOT NULL,
    file_url TEXT NOT NULL,
    changelog TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beta_mod_id UUID NOT NULL REFERENCES beta_mods(id) ON DELETE CASCADE,
    build_id UUID REFERENCES builds(id),
    reporter_id UUID NOT NULL REFERENCES users(id),
    severity bug_severity NOT NULL,
    description TEXT NOT NULL,
    repro_steps TEXT,
    attachment_url TEXT,
    status bug_status NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ready_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beta_mod_id UUID NOT NULL REFERENCES beta_mods(id) ON DELETE CASCADE,
    tester_id UUID NOT NULL REFERENCES users(id),
    is_ready BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (beta_mod_id, tester_id)
);

CREATE TABLE requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beta_mod_id UUID NOT NULL REFERENCES beta_mods(id) ON DELETE CASCADE,
    nexus_mod_name TEXT NOT NULL,
    nexus_mod_url TEXT
);

CREATE TABLE nexus_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    nexus_api_key_encrypted TEXT NOT NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
