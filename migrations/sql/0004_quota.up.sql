-- Migration 0004: Usage / quota ledger
-- Dependency: 0001 (users)

CREATE TABLE usage_ledger (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id),
    job_id           UUID,
    event_type       TEXT NOT NULL,
    quantity         INTEGER NOT NULL DEFAULT 1,
    billable         BOOLEAN NOT NULL DEFAULT TRUE,
    failure_class    TEXT,
    billing_cycle_id UUID,
    idempotency_key  TEXT NOT NULL UNIQUE,
    recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON usage_ledger (user_id, recorded_at);
CREATE INDEX ON usage_ledger (job_id);
CREATE INDEX ON usage_ledger (idempotency_key);

CREATE TABLE quota_reservations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    job_id          UUID NOT NULL,
    phase           INTEGER NOT NULL CHECK (phase IN (1, 2, 3)),
    quantity        INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
    idempotency_key TEXT NOT NULL UNIQUE,
    lock_owner      TEXT,
    reserved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    committed_at    TIMESTAMPTZ,
    released_at     TIMESTAMPTZ,
    release_reason  TEXT
);
CREATE INDEX ON quota_reservations (job_id);
CREATE INDEX ON quota_reservations (idempotency_key);
