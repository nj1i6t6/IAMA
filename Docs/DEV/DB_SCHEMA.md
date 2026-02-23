# IAMA Database Schema

Document ID: `IAMA-DEV-DB`
Version: `1.0`
Status: `Authoritative`
Audience: Backend Engineers, AI Agent Developers
Database: PostgreSQL

## 1. Overview

This document defines all required database entities for IAMA V1 and V2.
Agents must not add entities or columns not defined here without a schema change review.
All entity names use snake_case in the database.

V1 entities: Sections 2–14
V2 additions: Sections 15–18
Admin Console entities: Section 19
Schema Invariants: Section 20

---

## 2. Core Entities

### `users`
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT,                  -- nullable: OAuth-only users may not have a password
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,           -- soft delete; hard delete via erasure_requests
    consent_given_at TIMESTAMPTZ           -- V1-FR-SEC-005: data processing consent timestamp
);
CREATE INDEX ON users (email);
```

### `oauth_accounts`
Third-party OAuth identity bindings. One user may have multiple entries (one per provider).
This table is for **identity/login** only. GitHub repository access tokens are stored separately in `repository_connections` (V2).
```sql
CREATE TABLE oauth_accounts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id),
    provider             TEXT NOT NULL CHECK (provider IN ('GITHUB', 'GOOGLE')),
    provider_account_id  TEXT NOT NULL,     -- provider's stable internal user ID (not login name)
    provider_login       TEXT,              -- human-readable login (e.g. GitHub username)
    provider_email       TEXT,              -- email as reported by provider (may differ from users.email)
    scopes               TEXT[] NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON oauth_accounts (provider, provider_account_id); -- one record per provider account globally
CREATE INDEX ON oauth_accounts (user_id);
```

### `subscription_tiers`
IAMA's internal entitlement record — the authoritative source for what capabilities the user
currently has within IAMA. Updated by the billing webhook handler when payment state changes.
This is the table queried for all access control and quota decisions (`GET /api/v1/subscription/me`).
```sql
CREATE TABLE subscription_tiers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    tier            TEXT NOT NULL CHECK (tier IN ('FREE', 'PLUS', 'PRO', 'MAX', 'ENTERPRISE')),
    status          TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIAL')),
    context_cap     INTEGER NOT NULL,       -- token cap per request: 128000 (Free/Plus), 200000 (Pro/Max), 1000000 (Enterprise)
                                            -- NOTE: Max tier cap is 200000, NOT 500000. Only Enterprise is 1000000.
    operating_mode  TEXT NOT NULL CHECK (operating_mode IN ('SIMPLE', 'PROFESSIONAL', 'ENTERPRISE')),
    billing_cycle_start TIMESTAMPTZ NOT NULL,
    billing_cycle_end   TIMESTAMPTZ NOT NULL,
    payment_gateway TEXT,                  -- 'stripe' | 'lemonsqueezy'
    external_customer_id TEXT,             -- gateway customer reference
    external_subscription_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON subscription_tiers (user_id);
CREATE INDEX ON subscription_tiers (external_subscription_id);
```

### `usage_ledger`
```sql
CREATE TABLE usage_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    job_id          UUID,                  -- nullable (some charges may be pre-job)
    event_type      TEXT NOT NULL,         -- 'phase_1_call', 'phase_2_call', 'phase_3_call', 'sandbox_second'
    quantity        INTEGER NOT NULL DEFAULT 1,
    billable        BOOLEAN NOT NULL DEFAULT TRUE,
    failure_class   TEXT,                  -- 'INFRA_FAILURE' | 'LOGIC_FAILURE' | 'USER_CANCELLED' | 'POLICY_BLOCKED' | 'TIMEOUT_EXECUTION' | 'CLIENT_DISCONNECTED'
    billing_cycle_id UUID,
    idempotency_key TEXT NOT NULL UNIQUE,  -- format: {job_id}:{model_class}:{attempt_number}; prevents double-counting on retry
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON usage_ledger (user_id, recorded_at);
CREATE INDEX ON usage_ledger (job_id);
CREATE INDEX ON usage_ledger (idempotency_key);
```

### `quota_reservations`
Atomic quota reservation before job enters ANALYZING (V1-FR-BIL-004).
```sql
CREATE TABLE quota_reservations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    job_id          UUID NOT NULL,
    phase           INTEGER NOT NULL CHECK (phase IN (1, 2, 3)),
    quantity        INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
    idempotency_key TEXT NOT NULL UNIQUE,  -- prevents double-reservation
    lock_owner      TEXT,                  -- worker instance id
    reserved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    committed_at    TIMESTAMPTZ,
    released_at     TIMESTAMPTZ,
    release_reason  TEXT                   -- 'JOB_SUCCESS' | 'JOB_FAILED_NON_BILLABLE' | 'CLIENT_DISCONNECTED_EARLY'
);
CREATE INDEX ON quota_reservations (job_id);
CREATE INDEX ON quota_reservations (idempotency_key);
```

---

## 3. Project and Job Entities

### `projects`
```sql
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id),
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON projects (owner_id);
```

### `refactor_jobs`
```sql
CREATE TABLE refactor_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id),
    owner_id        UUID NOT NULL REFERENCES users(id),  -- enforced on all access (V1-FR-JOB-002)
    status          TEXT NOT NULL DEFAULT 'PENDING',     -- WorkflowState enum
    execution_mode  TEXT NOT NULL CHECK (execution_mode IN ('LOCAL_DOCKER', 'LOCAL_NATIVE', 'REMOTE_SANDBOX')),
    target_paths    TEXT[] NOT NULL,
    refactor_context TEXT,
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    identical_failure_count INTEGER NOT NULL DEFAULT 0,
    failure_pattern_fingerprint TEXT,                    -- tracks same-error detection (V1-FR-TEST-003)
    current_phase   INTEGER,
    baseline_mode_used TEXT,                             -- 'ASSERTION' | 'CHARACTERIZATION' | 'BLACK_BOX_ORCHESTRATION'
    failure_reason  TEXT,
    billing_subject TEXT NOT NULL DEFAULT 'USER',        -- 'USER' | 'ORG' (V2-FR-BIL-007)
    org_id          UUID,                                -- V2 team workspace billing
    artifact_expires_at TIMESTAMPTZ,                     -- TTL for code-bearing artifacts (default 14 days)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX ON refactor_jobs (owner_id, created_at DESC);
CREATE INDEX ON refactor_jobs (status);
CREATE INDEX ON refactor_jobs (project_id);
```

### `job_artifacts`
```sql
CREATE TABLE job_artifacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    artifact_type   TEXT NOT NULL,  -- 'PATCH' | 'DIFF' | 'PARTIAL_ARTIFACT' | 'REVERSE_PATCH' | 'ENTERPRISE_REPORT_PDF' | 'ENTERPRISE_REPORT_JSON'
    storage_key     TEXT NOT NULL,  -- object storage key (encrypted at rest)
    content_hash    TEXT NOT NULL,  -- SHA-256 of content
    size_bytes      INTEGER NOT NULL,
    encrypted       BOOLEAN NOT NULL DEFAULT TRUE,
    kms_key_ref     TEXT NOT NULL,  -- key management reference
    retention_policy_version TEXT NOT NULL DEFAULT '1.0',
    expires_at      TIMESTAMPTZ NOT NULL,  -- hard-delete deadline
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON job_artifacts (job_id);
CREATE INDEX ON job_artifacts (expires_at);  -- for TTL cleanup job
```

---

## 4. Spec Entities

### `bdd_items`
```sql
CREATE TABLE bdd_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    revision_id     UUID NOT NULL,
    given           TEXT NOT NULL,
    when_action     TEXT NOT NULL,
    then_outcome    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON bdd_items (job_id, revision_id);
```

### `sdd_items`
```sql
CREATE TABLE sdd_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    revision_id     UUID NOT NULL,
    component       TEXT NOT NULL,
    responsibility  TEXT NOT NULL,
    interface_notes TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON sdd_items (job_id, revision_id);
```

### `spec_revisions`
```sql
CREATE TABLE spec_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    revision_token  TEXT NOT NULL UNIQUE,  -- opaque concurrency token (V2-FR-WF-002)
    actor_id        UUID NOT NULL REFERENCES users(id),
    surface         TEXT NOT NULL CHECK (surface IN ('IDE', 'WEB')),
    bdd_snapshot    JSONB NOT NULL,        -- snapshot at time of revision
    sdd_snapshot    JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON spec_revisions (job_id, created_at DESC);
CREATE INDEX ON spec_revisions (revision_token);
```

---

## 5. Test and Execution Entities

### `test_runs`
```sql
CREATE TABLE test_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    spec_revision_id UUID NOT NULL REFERENCES spec_revisions(id),
    attempt_number  INTEGER NOT NULL,
    phase           INTEGER NOT NULL CHECK (phase IN (1, 2, 3)),
    run_type        TEXT NOT NULL CHECK (run_type IN ('BASELINE', 'REPAIR', 'DEEP_FIX', 'INTERVENTION', 'MANUAL')),
    status          TEXT NOT NULL CHECK (status IN ('RUNNING', 'PASSED', 'FAILED', 'TIMEOUT')),
    failure_class   TEXT,                  -- 'LOGIC_FAILURE' | 'TIMEOUT_EXECUTION' | 'INFRA_FAILURE'
    failure_pattern_fingerprint TEXT,      -- test names + error class + failure location hash
    execution_mode  TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER
);
CREATE UNIQUE INDEX ON test_runs (job_id, attempt_number, run_type);
CREATE INDEX ON test_runs (failure_pattern_fingerprint);
```

### `patch_attempts`
```sql
CREATE TABLE patch_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    test_run_id     UUID REFERENCES test_runs(id),
    attempt_number  INTEGER NOT NULL,
    phase           INTEGER NOT NULL,
    model_class     TEXT NOT NULL,         -- routing decision
    is_deep_fix     BOOLEAN NOT NULL DEFAULT FALSE,
    patch_summary   TEXT,
    outcome         TEXT CHECK (outcome IN ('APPLIED', 'FAILED', 'TIMEOUT', 'SKIPPED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON patch_attempts (job_id, attempt_number);
```

### `patch_edit_operations`
Per-edit-operation record for pruning-resilient delivery (V1-FR-DEL-004).
```sql
CREATE TABLE patch_edit_operations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    patch_attempt_id UUID NOT NULL REFERENCES patch_attempts(id),
    edit_type       TEXT NOT NULL CHECK (edit_type IN ('AST_SYMBOLIC', 'EXACT_SEARCH_REPLACE')),
    target_file     TEXT NOT NULL,
    target_file_fingerprint TEXT NOT NULL,  -- base hash before edit
    apply_anchor    TEXT NOT NULL,           -- AST node id or search-block fingerprint
    apply_outcome   TEXT CHECK (apply_outcome IN ('SUCCESS', 'FAILED', 'SKIPPED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON patch_edit_operations (job_id);
```

---

## 6. Audit and Observability Entities

### `audit_events`
```sql
CREATE TABLE audit_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID REFERENCES users(id),
    job_id          UUID REFERENCES refactor_jobs(id),
    event_type      TEXT NOT NULL,
    old_state       TEXT,
    new_state       TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    ip_address      INET,
    surface         TEXT CHECK (surface IN ('IDE', 'WEB', 'API', 'SYSTEM')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON audit_events (job_id, created_at DESC);
CREATE INDEX ON audit_events (actor_id, created_at DESC);
CREATE INDEX ON audit_events (event_type);
```

---

## 7. Payment Entities

### `payment_subscriptions`
Payment gateway mirror record — tracks the raw subscription state as reported by the payment
gateway (Stripe / LemonSqueezy). Used exclusively by the billing webhook handler for idempotency
and event replay. Do NOT use this table for access control or quota decisions; use `subscription_tiers` instead.
```sql
CREATE TABLE payment_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    gateway         TEXT NOT NULL,
    external_subscription_id TEXT NOT NULL UNIQUE,
    external_customer_id TEXT NOT NULL,
    tier            TEXT NOT NULL,
    status          TEXT NOT NULL,
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    last_webhook_event_id TEXT,            -- for idempotency; check before processing each webhook event
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON payment_subscriptions (user_id);
CREATE INDEX ON payment_subscriptions (external_subscription_id);
CREATE INDEX ON payment_subscriptions (last_webhook_event_id);  -- idempotency check
```

---

## 8. Configuration Entities

### `dynamic_configs`
Stores operator-controlled runtime configuration. Changes take effect without redeploy.
See Section 8.1 for the authoritative config key namespace.
```sql
CREATE TABLE dynamic_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key      TEXT NOT NULL UNIQUE,
    config_value    JSONB NOT NULL,
    scope           TEXT NOT NULL DEFAULT 'GLOBAL',  -- 'GLOBAL' | 'ORG' | 'USER'
    scope_id        UUID,
    updated_by      UUID REFERENCES admin_accounts(id),  -- admin who last changed this; NOT users table
    reason          TEXT,
    effective_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON dynamic_configs (config_key);
```

### 8.1 Config Key Namespace (Authoritative)

All config keys follow a dot-notation hierarchy. Values are JSONB.

**Model routing config** (ENGINEER or SUPER_ADMIN; `model.*.api_key_ref` requires SUPER_ADMIN):
```
model.l1   → { model_id, api_base_url, api_key_ref, output_token_limit, enabled }
model.l2   → { model_id, api_base_url, api_key_ref, output_token_limit, enabled }
model.l3   → { model_id, api_base_url, api_key_ref, output_token_limit, enabled }
```
- `api_key_ref`: path reference into the secrets manager (e.g. `"secrets/litellm/minimax_api_key"`). **NEVER store the actual API key in this table.**
- `output_token_limit`: hard cap on LLM output tokens per call (L1 default: 30000; L2/L3 default: 5000).

**Tier context caps** (ENGINEER or SUPER_ADMIN):
```
tier_context_caps → { FREE: 128000, PLUS: 128000, PRO: 200000, MAX: 200000, ENTERPRISE: 1000000 }
```
- Changing these values takes effect on the NEXT job creation; running jobs read from `entitlement_snapshots` (immutable).

**Feature flags** (ENGINEER or SUPER_ADMIN):
```
feature.black_box_orchestration          → boolean (default: false)
feature.cross_ecosystem_v1x              → boolean (default: false; Enterprise only)
feature.enterprise_trial_provisioning   → boolean (default: true)
feature.baseline_ast_confidence_threshold → number (default: 40; percent)
```

**Kill switches** (ENGINEER or SUPER_ADMIN for global; SUPPORT can apply per-user via API):
```
system.kill_switch.global   → boolean (default: false)
system.kill_switch.reason   → string
```

**Source language matrix** (ENGINEER or SUPER_ADMIN):
```
language_matrix → { approved_pairs: [{ source, target, mode }], version: string }
```

---

## 9. Support Entities

### `support_ticket_logs`
```sql
CREATE TABLE support_ticket_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    job_id          UUID REFERENCES refactor_jobs(id),
    external_ticket_id TEXT NOT NULL,
    issue_type      TEXT NOT NULL,
    consent_given   BOOLEAN NOT NULL DEFAULT FALSE,
    payload_mode    TEXT NOT NULL DEFAULT 'METADATA_ONLY',  -- 'METADATA_ONLY' | 'WITH_CONTEXT' (Enterprise admin override)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON support_ticket_logs (user_id);
CREATE INDEX ON support_ticket_logs (job_id);
```

---

## 10. Heartbeat Session Entity

### `client_heartbeat_sessions`
```sql
CREATE TABLE client_heartbeat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    session_id      TEXT NOT NULL,
    workflow_run_id TEXT NOT NULL,          -- Temporal workflow run id
    status          TEXT NOT NULL CHECK (status IN ('ACTIVE', 'GRACE_PERIOD', 'LOST', 'RECOVERED', 'TERMINATED')),
    timeout_policy_version TEXT NOT NULL DEFAULT '1.0',
    grace_window_seconds INTEGER NOT NULL DEFAULT 300,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    grace_deadline_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON client_heartbeat_sessions (job_id, session_id);
```

---

## 11. Billing Checkpoint Entity

### `billing_checkpoint_records`
Point-of-no-return billing checkpoints per V1-FR-BIL-006.
```sql
CREATE TABLE billing_checkpoint_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    workflow_state  TEXT NOT NULL,          -- state at checkpoint (e.g. 'GENERATING_TESTS')
    checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('PRE_CHARGE', 'POST_CHARGE')),
    charge_policy   TEXT NOT NULL,          -- 'NON_BILLABLE_DISCONNECT' | 'BILLABLE_COMMITTED'
    disconnect_at   TIMESTAMPTZ,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON billing_checkpoint_records (job_id);
```

> **Dual-failure edge case** (CLIENT_DISCONNECTED simultaneous with E2B infrastructure failure):
> `INFRA_FAILURE` is always dominant over `CLIENT_DISCONNECTED` in billing determination. When computing the final charge decision at job termination:
> 1. First check `remote_execution_sessions.status` for the associated job.
> 2. If `status = 'FAILED'` (not `'COMPLETED'` or `'WIPED'`), treat as `INFRA_FAILURE` — do NOT charge, set `usage_ledger.failure_class = 'INFRA_FAILURE'`, regardless of any `billing_checkpoint_records.charge_policy` value that was written before the infra event.
> 3. Only if `remote_execution_sessions.status` is `'COMPLETED'` or `'WIPED'` (infra succeeded) should `billing_checkpoint_records.charge_policy` govern the billing outcome.
> This precedence rule prevents double-punishment of users who both disconnected AND encountered an infrastructure failure. See `agent.md` Resolution 24.
```

---

## 12. V2 Organization and Team Entities

### `organizations`
```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    owner_id        UUID NOT NULL REFERENCES users(id),
    tier            TEXT NOT NULL,
    enterprise_report_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    zero_telemetry_mode BOOLEAN NOT NULL DEFAULT FALSE,
    support_payload_mode TEXT NOT NULL DEFAULT 'METADATA_ONLY',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `teams`
```sql
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id),
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON teams (org_id);
```

### `team_member_roles`
```sql
CREATE TABLE team_member_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         UUID NOT NULL REFERENCES teams(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    role            TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
    granted_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON team_member_roles (team_id, user_id);
```

### `organization_wallets`
```sql
CREATE TABLE organization_wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL UNIQUE REFERENCES organizations(id),
    phase_2_balance INTEGER NOT NULL DEFAULT 0,
    phase_3_balance INTEGER NOT NULL DEFAULT 0,
    sandbox_seconds_balance BIGINT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 13. V2 GitHub Integration Entities

### `repository_connections`
```sql
CREATE TABLE repository_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    org_id          UUID REFERENCES organizations(id),
    github_installation_id TEXT,           -- GitHub App installation ID (from /api/v2/github/callback); required for installation token generation and revocation webhook matching (V2-FR-GH-010); NULL only for legacy rows pre-GitHub-App migration
    github_account_login TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,  -- encrypted at rest; stores GitHub App installation access token (short-lived, refreshed via installation_id)
    kms_key_ref     TEXT NOT NULL,
    scopes          TEXT[] NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    revoked_at      TIMESTAMPTZ,
    revoke_source   TEXT,                  -- 'USER_PORTAL' | 'GITHUB_OUT_OF_BAND'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON repository_connections (user_id);
```

### `repository_workspaces`
```sql
CREATE TABLE repository_workspaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id   UUID NOT NULL REFERENCES repository_connections(id),
    github_repo_id  TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    branch          TEXT NOT NULL,
    path_scope      TEXT NOT NULL,
    job_id          UUID REFERENCES refactor_jobs(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON repository_workspaces (connection_id);
CREATE INDEX ON repository_workspaces (job_id);
```

### `branch_head_snapshots`
```sql
CREATE TABLE branch_head_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    repo_full_name  TEXT NOT NULL,
    branch          TEXT NOT NULL,
    head_sha_at_start TEXT NOT NULL,
    head_sha_at_delivery TEXT,
    revalidated_at  TIMESTAMPTZ,
    conflict_detected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON branch_head_snapshots (job_id);
```

### `github_revocation_events`
Out-of-band GitHub revocation records (V2-FR-GH-010).
```sql
CREATE TABLE github_revocation_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_installation_id TEXT,
    github_account_login TEXT,
    event_type      TEXT NOT NULL,          -- 'github_app_authorization'
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    connection_id   UUID REFERENCES repository_connections(id),
    syncs_terminated INTEGER NOT NULL DEFAULT 0,
    tokens_invalidated INTEGER NOT NULL DEFAULT 0,
    processed       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX ON github_revocation_events (github_installation_id);
```

### `code_provenance_records`
```sql
CREATE TABLE code_provenance_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    github_pr_url   TEXT,
    github_commit_sha TEXT,
    co_authored_by  TEXT NOT NULL DEFAULT 'IAMA-Agent <bot@iama.dev>',
    job_id_reference TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON code_provenance_records (job_id);
```

---

## 14. V2 Remote Execution Entities

### `remote_execution_sessions`
```sql
CREATE TABLE remote_execution_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    sandbox_provider TEXT NOT NULL DEFAULT 'E2B',
    sandbox_id      TEXT NOT NULL,          -- E2B sandbox instance id
    isolation_type  TEXT NOT NULL CHECK (isolation_type IN ('GVISOR', 'FIRECRACKER')),
    status          TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'WIPED')),
    network_policy  TEXT NOT NULL CHECK (network_policy IN ('BUILD_ALLOWLIST', 'TEST_DENY_ALL', 'ENTERPRISE_FQDN_ALLOWLIST')),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    wipe_started_at TIMESTAMPTZ,
    wipe_completed_at TIMESTAMPTZ
);
CREATE INDEX ON remote_execution_sessions (job_id);
```

### `secure_wipe_evidence`
```sql
CREATE TABLE secure_wipe_evidence (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    execution_session_id UUID NOT NULL REFERENCES remote_execution_sessions(id),
    wipe_type       TEXT NOT NULL CHECK (wipe_type IN ('WORKSPACE_VOLUME', 'COW_LAYER', 'SCRATCH_SOURCE', 'EPHEMERAL_DISK')),
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    evidence_hash   TEXT,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON secure_wipe_evidence (job_id);
```

### `dependency_cache_index`
```sql
CREATE TABLE dependency_cache_index (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id),
    repo_id         TEXT NOT NULL,
    cache_key       TEXT NOT NULL,          -- hash of dependency manifest
    cache_storage_key TEXT NOT NULL,
    cache_layer_type TEXT NOT NULL CHECK (cache_layer_type IN ('READ_ONLY_BASE', 'COW_JOB_LAYER')),
    job_id          UUID REFERENCES refactor_jobs(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX ON dependency_cache_index (org_id, repo_id, cache_key, cache_layer_type);
-- CONSTRAINT: no cross-org cache lookup possible by schema design
```

### `repo_sync_scratch_records`
```sql
CREATE TABLE repo_sync_scratch_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    scratch_storage_key TEXT NOT NULL,
    payload_handoff_at TIMESTAMPTZ,
    wipe_completed_at TIMESTAMPTZ,
    wipe_evidence_hash TEXT
);
CREATE INDEX ON repo_sync_scratch_records (job_id);
```

### `entitlement_snapshots`
Immutable entitlement record at execution start (V2-FR-BIL-007).
```sql
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
```

---

## 15. V2 Compliance Entities

### `data_erasure_requests`
```sql
CREATE TABLE data_erasure_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    completed_at    TIMESTAMPTZ,
    evidence_log    JSONB                   -- record of what was deleted
);
CREATE INDEX ON data_erasure_requests (user_id);
```

### `audit_export_jobs`
```sql
CREATE TABLE audit_export_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id),
    requested_by    UUID NOT NULL REFERENCES users(id),
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    filters         JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    export_url      TEXT,                   -- signed temp URL
    event_count     INTEGER,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON audit_export_jobs (org_id);
```

---

## 16. V2 Billing Snapshot Entities

### `billing_subject_snapshots`
Immutable per-job billing ownership record (V2-FR-BIL-007).
```sql
CREATE TABLE billing_subject_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL UNIQUE REFERENCES refactor_jobs(id),
    billing_subject TEXT NOT NULL CHECK (billing_subject IN ('USER', 'ORG')),
    user_id         UUID NOT NULL REFERENCES users(id),
    org_id          UUID REFERENCES organizations(id),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `premium_usage_ledger`
V2 extension of usage_ledger for remote compute dimensions.
```sql
CREATE TABLE premium_usage_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    billing_subject TEXT NOT NULL,
    subject_id      UUID NOT NULL,          -- user_id or org_id
    dimension       TEXT NOT NULL CHECK (dimension IN ('SANDBOX_SECONDS', 'PHASE_2_RUN', 'PHASE_3_RUN')),
    quantity        NUMERIC NOT NULL,
    billable        BOOLEAN NOT NULL DEFAULT TRUE,
    failure_reason  TEXT,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON premium_usage_ledger (job_id);
CREATE INDEX ON premium_usage_ledger (subject_id, dimension, recorded_at);
```

---

## 17. V2 Remote Diff Sync Entities

### `remote_diff_sync_records`
```sql
CREATE TABLE remote_diff_sync_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    requester_id    UUID NOT NULL REFERENCES users(id),
    artifact_hash   TEXT NOT NULL,          -- immutable manifest hash
    apply_outcome   TEXT CHECK (apply_outcome IN ('APPLIED', 'BLOCKED_CONFLICT', 'REJECTED_BY_USER')),
    conflict_files  TEXT[],
    conflict_resolution_mode TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON remote_diff_sync_records (job_id);
```

---

## 18. V2 Delivery and Rebase Entities

### `delivery_policy_snapshots`
```sql
CREATE TABLE delivery_policy_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL UNIQUE REFERENCES refactor_jobs(id),
    policy          TEXT NOT NULL CHECK (policy IN ('DRAFT_PR', 'READY_FOR_REVIEW_PR')),
    org_guardrail_applied BOOLEAN NOT NULL DEFAULT FALSE,
    resulting_pr_state TEXT,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `rebase_validation_records`
```sql
CREATE TABLE rebase_validation_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    source_head_sha TEXT NOT NULL,
    rebased_head_sha TEXT,
    baseline_outcome TEXT CHECK (baseline_outcome IN ('PASSED', 'FAILED', 'SKIPPED')),
    terminal_resolution TEXT CHECK (terminal_resolution IN ('DELIVERY_SUCCESS', 'TERMINAL_CONFLICT', 'IN_PROGRESS')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON rebase_validation_records (job_id);
```

### `merge_assist_records`
```sql
CREATE TABLE merge_assist_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES refactor_jobs(id),
    strategy        TEXT NOT NULL CHECK (strategy IN ('THREE_WAY_MERGE', 'AUTO_STASH_APPLY_POP')),
    touched_files   TEXT[],
    conflict_markers_present BOOLEAN NOT NULL DEFAULT FALSE,
    user_confirmed  BOOLEAN,
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON merge_assist_records (job_id);
```

---

## 19. Admin Console Entities

Admin accounts are **entirely separate from end-user `users` accounts**. They cannot log in to the product, only to the admin portal. Admin sessions use short-lived tokens (8-hour expiry). There are no OAuth logins for admin accounts — only email/password with mandatory 2FA (enforced at application layer).

### `admin_accounts`
```sql
CREATE TABLE admin_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ENGINEER', 'SUPPORT')),
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    created_by      UUID REFERENCES admin_accounts(id),  -- null only for bootstrap SUPER_ADMIN
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON admin_accounts (email);
CREATE INDEX ON admin_accounts (role);
```

### `admin_sessions`
Short-lived admin sessions. Tokens are opaque (stored as bcrypt hash). Invalidated on logout or after 8-hour expiry.
```sql
CREATE TABLE admin_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID NOT NULL REFERENCES admin_accounts(id),
    token_hash      TEXT NOT NULL UNIQUE,   -- bcrypt hash of bearer token; never store raw token
    ip_address      TEXT,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,   -- 8-hour sessions; no refresh — re-authenticate
    revoked_at      TIMESTAMPTZ,            -- null = active; non-null = logged out
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON admin_sessions (admin_id);
CREATE INDEX ON admin_sessions (token_hash);
```

### Role Permission Matrix

| Action | SUPER_ADMIN | ENGINEER | SUPPORT |
|--------|:-----------:|:--------:|:-------:|
| Manage other admin accounts | ✅ | ❌ | ❌ |
| Change `model.*.api_key_ref` (secret pointer) | ✅ | ❌ | ❌ |
| Change model routing / API URL / token limits | ✅ | ✅ | ❌ |
| Change tier context caps | ✅ | ✅ | ❌ |
| Feature flags | ✅ | ✅ | ❌ |
| Global kill switch | ✅ | ✅ | ❌ |
| Per-user kill switch | ✅ | ✅ | ✅ |
| User 360 view | ✅ | ✅ (read-only) | ✅ |
| Manual quota adjustment | ✅ | ❌ | ✅ |
| System health dashboard | ✅ | ✅ | ❌ |
| View audit log (all users) | ✅ | ✅ | ❌ |
| View audit log (own actions only) | ✅ | ✅ | ✅ |

---

## 20. Schema Invariants

Agents must not violate these invariants:

1. **Owner reference**: Every `refactor_jobs` row must have a valid `owner_id` referencing `users`.
2. **BDD/SDD linkage**: Every `bdd_items` and `sdd_items` row must have a valid `job_id` and `revision_id`.
3. **Test run linkage**: Every `test_runs` row must have a valid `spec_revision_id`.
4. **Artifact encryption**: Every `job_artifacts` row must have `encrypted = TRUE` and a valid `kms_key_ref`.
5. **Artifact TTL**: Every `job_artifacts` row must have a non-null `expires_at`.
6. **Quota idempotency**: `quota_reservations.idempotency_key` must be UNIQUE — prevents double-spend.
7. **Usage ledger idempotency**: `usage_ledger.idempotency_key` must be UNIQUE — prevents double-counting on retry. Format: `{job_id}:{model_class}:{attempt_number}`. Insert with `ON CONFLICT DO NOTHING`.
8. **Cache isolation**: `dependency_cache_index` queries must always include `org_id` filter — no cross-org hits.
9. **Secure wipe**: `remote_execution_sessions` cannot set `status = 'COMPLETED'` without a corresponding `secure_wipe_evidence` row with `verified = TRUE`.
10. **Billing snapshot**: `entitlement_snapshots` must be written before a job enters ANALYZING.
11. **Billing subject snapshot**: `billing_subject_snapshots` must be written at job creation for all V2 team workspace jobs.
12. **Provenance**: All GitHub PRs created by platform must produce a `code_provenance_records` row.
13. **Delivery policy**: `delivery_policy_snapshots` must be written at job creation; it is immutable after write.
14. **Revision token uniqueness**: `spec_revisions.revision_token` must be UNIQUE and globally opaque.
15. **OAuth account uniqueness**: `oauth_accounts (provider, provider_account_id)` must be UNIQUE — one provider account can only link to one IAMA user.
16. **Subscription authority**: For all access control and quota checks, query `subscription_tiers`. Never query `payment_subscriptions` for entitlement decisions — that table is for billing webhook idempotency only.
17. **OAuth vs repository tokens**: `oauth_accounts` stores identity provider bindings (login). GitHub repository access tokens are stored in `repository_connections` (V2). These are distinct concerns and must not be conflated.
18. **Admin/user separation**: `admin_accounts` rows must never reference `users` rows and vice versa. Admin portal sessions use `admin_sessions`; product sessions use `refresh_tokens`. Never mix the two session tables.
19. **Config secrets never in DB**: `dynamic_configs` rows with key pattern `*.api_key_ref` must contain only a path reference string (e.g. `"secrets/litellm/anthropic_api_key"`). Actual API keys or secrets must never be stored as `config_value`.
20. **dynamic_configs.updated_by references admin_accounts**: The `updated_by` foreign key on `dynamic_configs` points to `admin_accounts.id`, NOT `users.id`. An admin must be authenticated to write config.
21. **Test run idempotency**: `test_runs (job_id, attempt_number, run_type)` is UNIQUE (enforced by unique index). Temporal's at-least-once execution semantics mean a `runTests` activity may be retried on infrastructure failure. All inserts to `test_runs` must use `ON CONFLICT (job_id, attempt_number, run_type) DO NOTHING` and verify the row exists after insert. Duplicate test run records would corrupt `identical_failure_count` calculation and break the Fallback UI.
22. **Patch attempt idempotency**: `patch_attempts (job_id, attempt_number)` is UNIQUE (enforced by unique index). Temporal's at-least-once execution semantics mean a `generatePatch` activity may be retried on infrastructure failure. All inserts to `patch_attempts` must use `ON CONFLICT (job_id, attempt_number) DO NOTHING` and verify the row exists after insert. Duplicate patch attempt records would break attempt history reconstruction and the Fallback evidence surface.
23. **INFRA_FAILURE billing precedence**: When computing final billing for a terminal job, `remote_execution_sessions.status` is checked first. If `status = 'FAILED'`, set `usage_ledger.failure_class = 'INFRA_FAILURE'` and do not charge, regardless of any `billing_checkpoint_records.charge_policy` value. `INFRA_FAILURE` is always dominant over `CLIENT_DISCONNECTED`. See `billing_checkpoint_records` Section 11 note.
