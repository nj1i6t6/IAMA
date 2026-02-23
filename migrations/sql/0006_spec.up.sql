-- Migration 0006: Spec entities (BDD/SDD)
-- Dependency: 0005 (refactor_jobs), 0001 (users)

CREATE TABLE spec_revisions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id         UUID NOT NULL REFERENCES refactor_jobs(id),
    revision_token TEXT NOT NULL UNIQUE,
    actor_id       UUID NOT NULL REFERENCES users(id),
    surface        TEXT NOT NULL CHECK (surface IN ('IDE', 'WEB')),
    bdd_snapshot   JSONB NOT NULL,
    sdd_snapshot   JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON spec_revisions (job_id, created_at DESC);
CREATE INDEX ON spec_revisions (revision_token);

CREATE TABLE bdd_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id      UUID NOT NULL REFERENCES refactor_jobs(id),
    revision_id UUID NOT NULL,
    given       TEXT NOT NULL,
    when_action TEXT NOT NULL,
    then_outcome TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON bdd_items (job_id, revision_id);

CREATE TABLE sdd_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id           UUID NOT NULL REFERENCES refactor_jobs(id),
    revision_id      UUID NOT NULL,
    component        TEXT NOT NULL,
    responsibility   TEXT NOT NULL,
    interface_notes  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON sdd_items (job_id, revision_id);
