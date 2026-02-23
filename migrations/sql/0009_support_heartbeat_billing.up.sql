-- Migration 0009: Support, heartbeat, billing checkpoint
-- Dependency: 0005 (refactor_jobs), 0001 (users)

CREATE TABLE support_ticket_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id),
    job_id             UUID REFERENCES refactor_jobs(id),
    external_ticket_id TEXT NOT NULL,
    issue_type         TEXT NOT NULL,
    consent_given      BOOLEAN NOT NULL DEFAULT FALSE,
    payload_mode       TEXT NOT NULL DEFAULT 'METADATA_ONLY',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON support_ticket_logs (user_id);
CREATE INDEX ON support_ticket_logs (job_id);

CREATE TABLE client_heartbeat_sessions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id                 UUID NOT NULL REFERENCES refactor_jobs(id),
    session_id             TEXT NOT NULL,
    workflow_run_id        TEXT NOT NULL,
    status                 TEXT NOT NULL CHECK (status IN ('ACTIVE', 'GRACE_PERIOD', 'LOST', 'RECOVERED', 'TERMINATED')),
    timeout_policy_version TEXT NOT NULL DEFAULT '1.0',
    grace_window_seconds   INTEGER NOT NULL DEFAULT 300,
    last_seen_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    grace_deadline_at      TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON client_heartbeat_sessions (job_id, session_id);

CREATE TABLE billing_checkpoint_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    workflow_state  TEXT NOT NULL,
    checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('PRE_CHARGE', 'POST_CHARGE')),
    charge_policy   TEXT NOT NULL,
    disconnect_at   TIMESTAMPTZ,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON billing_checkpoint_records (job_id);
