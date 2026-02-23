-- Migration 0008: Audit events
-- Dependency: 0005 (refactor_jobs), 0001 (users)

CREATE TABLE audit_events (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id   UUID REFERENCES users(id),
    job_id     UUID REFERENCES refactor_jobs(id),
    event_type TEXT NOT NULL,
    old_state  TEXT,
    new_state  TEXT,
    metadata   JSONB NOT NULL DEFAULT '{}',
    ip_address INET,
    surface    TEXT CHECK (surface IN ('IDE', 'WEB', 'API', 'SYSTEM')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON audit_events (job_id, created_at DESC);
CREATE INDEX ON audit_events (actor_id, created_at DESC);
CREATE INDEX ON audit_events (event_type);
