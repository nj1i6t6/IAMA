-- Migration 0005: Projects and refactor jobs
-- Dependency: 0001 (users)

CREATE TABLE projects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID NOT NULL REFERENCES users(id),
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON projects (owner_id);

CREATE TABLE refactor_jobs (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id                  UUID REFERENCES projects(id),
    owner_id                    UUID NOT NULL REFERENCES users(id),
    status                      TEXT NOT NULL DEFAULT 'PENDING',
    execution_mode              TEXT NOT NULL CHECK (execution_mode IN ('LOCAL_DOCKER', 'LOCAL_NATIVE', 'REMOTE_SANDBOX')),
    target_paths                TEXT[] NOT NULL,
    refactor_context            TEXT,
    attempt_count               INTEGER NOT NULL DEFAULT 0,
    identical_failure_count     INTEGER NOT NULL DEFAULT 0,
    failure_pattern_fingerprint TEXT,
    current_phase               INTEGER,
    baseline_mode_used          TEXT,
    failure_reason              TEXT,
    billing_subject             TEXT NOT NULL DEFAULT 'USER',
    org_id                      UUID,
    artifact_expires_at         TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at                TIMESTAMPTZ
);
CREATE INDEX ON refactor_jobs (owner_id, created_at DESC);
CREATE INDEX ON refactor_jobs (status);
CREATE INDEX ON refactor_jobs (project_id);

CREATE TABLE job_artifacts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id                  UUID NOT NULL REFERENCES refactor_jobs(id),
    artifact_type           TEXT NOT NULL,
    storage_key             TEXT NOT NULL,
    content_hash            TEXT NOT NULL,
    size_bytes              INTEGER NOT NULL,
    encrypted               BOOLEAN NOT NULL DEFAULT TRUE,
    kms_key_ref             TEXT NOT NULL,
    retention_policy_version TEXT NOT NULL DEFAULT '1.0',
    expires_at              TIMESTAMPTZ NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON job_artifacts (job_id);
CREATE INDEX ON job_artifacts (expires_at);

-- Add foreign key from usage_ledger.job_id to refactor_jobs (deferred to avoid circular dep)
ALTER TABLE usage_ledger ADD CONSTRAINT fk_usage_ledger_job
    FOREIGN KEY (job_id) REFERENCES refactor_jobs(id);

-- Add foreign key from quota_reservations.job_id to refactor_jobs
ALTER TABLE quota_reservations ADD CONSTRAINT fk_quota_reservations_job
    FOREIGN KEY (job_id) REFERENCES refactor_jobs(id);
