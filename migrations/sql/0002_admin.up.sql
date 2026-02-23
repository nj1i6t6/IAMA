-- Migration 0002: Admin entities (needed before dynamic_configs which references admin_accounts)
-- Dependency: none (fully independent of users table)

CREATE TABLE admin_accounts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ENGINEER', 'SUPPORT')),
    status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    created_by    UUID REFERENCES admin_accounts(id),
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON admin_accounts (email);
CREATE INDEX ON admin_accounts (role);

CREATE TABLE admin_sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id   UUID NOT NULL REFERENCES admin_accounts(id),
    token_hash TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON admin_sessions (admin_id);
CREATE INDEX ON admin_sessions (token_hash);
