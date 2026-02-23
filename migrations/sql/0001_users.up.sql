-- Migration 0001: Core user entities
-- Dependency: none

CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            TEXT NOT NULL UNIQUE,
    password_hash    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    consent_given_at TIMESTAMPTZ
);
CREATE INDEX ON users (email);

CREATE TABLE oauth_accounts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id),
    provider             TEXT NOT NULL CHECK (provider IN ('GITHUB', 'GOOGLE')),
    provider_account_id  TEXT NOT NULL,
    provider_login       TEXT,
    provider_email       TEXT,
    scopes               TEXT[] NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON oauth_accounts (provider, provider_account_id);
CREATE INDEX ON oauth_accounts (user_id);
