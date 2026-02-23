-- Migration 0007: Test and patch execution entities
-- Dependency: 0006 (spec_revisions), 0005 (refactor_jobs)

CREATE TABLE test_runs (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id                      UUID NOT NULL REFERENCES refactor_jobs(id),
    spec_revision_id            UUID NOT NULL REFERENCES spec_revisions(id),
    attempt_number              INTEGER NOT NULL,
    phase                       INTEGER NOT NULL CHECK (phase IN (1, 2, 3)),
    run_type                    TEXT NOT NULL CHECK (run_type IN ('BASELINE', 'REPAIR', 'DEEP_FIX', 'INTERVENTION', 'MANUAL')),
    status                      TEXT NOT NULL CHECK (status IN ('RUNNING', 'PASSED', 'FAILED', 'TIMEOUT')),
    failure_class               TEXT,
    failure_pattern_fingerprint TEXT,
    execution_mode              TEXT NOT NULL,
    started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at                TIMESTAMPTZ,
    duration_ms                 INTEGER
);
CREATE UNIQUE INDEX ON test_runs (job_id, attempt_number, run_type);
CREATE INDEX ON test_runs (failure_pattern_fingerprint);

CREATE TABLE patch_attempts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id         UUID NOT NULL REFERENCES refactor_jobs(id),
    test_run_id    UUID REFERENCES test_runs(id),
    attempt_number INTEGER NOT NULL,
    phase          INTEGER NOT NULL,
    model_class    TEXT NOT NULL,
    is_deep_fix    BOOLEAN NOT NULL DEFAULT FALSE,
    patch_summary  TEXT,
    outcome        TEXT CHECK (outcome IN ('APPLIED', 'FAILED', 'TIMEOUT', 'SKIPPED')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON patch_attempts (job_id, attempt_number);

CREATE TABLE patch_edit_operations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id               UUID NOT NULL REFERENCES refactor_jobs(id),
    patch_attempt_id     UUID NOT NULL REFERENCES patch_attempts(id),
    edit_type            TEXT NOT NULL CHECK (edit_type IN ('AST_SYMBOLIC', 'EXACT_SEARCH_REPLACE')),
    target_file          TEXT NOT NULL,
    target_file_fingerprint TEXT NOT NULL,
    apply_anchor         TEXT NOT NULL,
    apply_outcome        TEXT CHECK (apply_outcome IN ('SUCCESS', 'FAILED', 'SKIPPED')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON patch_edit_operations (job_id);
