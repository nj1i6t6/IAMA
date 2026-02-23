-- Migration 0010: Entitlement snapshots (V1 billing requirement per V1-FR-BIL-004)
-- Dependency: 0005 (refactor_jobs), 0001 (users)
-- NOTE: DB_SCHEMA.md labels this "V2" but implementation_plan.md Open Question #1 resolves:
-- this table MUST exist in V1 for billing integrity (AGENT_DEVELOPMENT_GUIDE.md Section 2.3 Rule 4).

CREATE TABLE entitlement_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL UNIQUE REFERENCES refactor_jobs(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    tier            TEXT NOT NULL,
    operating_mode  TEXT NOT NULL,
    execution_mode  TEXT NOT NULL,
    phase_limits    JSONB NOT NULL,
    web_github_enabled BOOLEAN NOT NULL,
    context_cap     INTEGER NOT NULL,
    snapshotted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refresh tokens (dedicated table per implementation_plan.md Open Question #2 recommendation
-- for multi-device support, per-token revocation, and clean audit trail)
CREATE TABLE refresh_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id),
    token_hash   TEXT NOT NULL UNIQUE,
    device_hint  TEXT,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON refresh_tokens (user_id);
CREATE INDEX ON refresh_tokens (token_hash);
