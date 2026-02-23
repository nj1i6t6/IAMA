# IAMA Agent Development Guide

**Purpose**: Prevent hallucination and development drift when AI agents implement IAMA.
**Audience**: AI coding agents (Claude Code, Cursor, Copilot Workspace, etc.) building this codebase.
**Version**: 1.0
**Last Updated**: 2026-02-22

---

## 0. Read This First

Before writing any code, read these documents in order:

| # | Document | Why Required |
|---|----------|-------------|
| 1 | `Docs/IAMA_PRODUCT_REQUIREMENTS_V1_EN.md` | Defines all V1 requirements, state machine, tier rules |
| 2 | `Docs/IAMA_PRODUCT_REQUIREMENTS_V2_EN.md` | Defines V2 additions and overrides |
| 3 | `Docs/DEV/API_CONTRACT.md` | Authoritative endpoint definitions ??do not invent routes |
| 4 | `Docs/DEV/DB_SCHEMA.md` | Authoritative table/column definitions ??do not invent tables |
| 5 | `Docs/ADR/ADR-001-Workflow-Engine.md` | Mandates Temporal.io ??never use Celery or custom polling |
| 6 | `Docs/ADR/ADR-002-LLM-Proxy.md` | Mandates LiteLLM ??never call model providers directly |
| 7 | `Docs/ADR/ADR-003-V2-Sandbox-Execution.md` | Mandates E2B self-hosted ??never use Modal or shared containers |

> **Hard rule**: If a behavior is not specified in these documents, do not invent it. Ask for a spec update instead.

---

## 1. Architecture Decisions ??Non-Negotiable

### 1.1 Workflow Engine (ADR-001)

- **MUST use**: Temporal.io for all async job orchestration
- **NEVER use**: Celery, Airflow, Bull, BullMQ, custom polling loops, or setTimeout-based retry
- Every refactor job maps to a **Temporal Workflow** with a stable workflow ID
- State transitions are driven by Temporal signals and activity results
- Heartbeat from IDE client ??Temporal heartbeat activity (not a custom ping table)
- Job cancellation = Temporal workflow cancellation signal

### 1.2 LLM Calls (ADR-002)

- **MUST use**: LiteLLM proxy + IAMA Router sidecar for all model calls
- **NEVER call**: Anthropic, OpenAI, or any model provider SDK directly from business logic
- All model calls go through `POST /v1/chat/completions` on the LiteLLM proxy endpoint
- Model selection is resolved by IAMA Router based on tier + phase + context length
- IAMA Router implements circuit-breaking and fallback — do not re-implement these in application code
- Token usage returned by LiteLLM must be recorded in `usage_ledger` after every call
- **Streaming cancellation on heartbeat loss (mandatory)**: LiteLLM streaming calls (`litellm.acompletion(..., stream=True)`) must be wrapped in an `asyncio.Task` inside the Temporal activity. The activity loop must check Temporal's cancellation status on each streamed chunk (via `activity.is_cancelled()` or equivalent Temporal SDK mechanism). On cancellation signal: cancel the `asyncio.Task`, allow `asyncio.CancelledError` to propagate, and re-raise so Temporal marks the activity as cancelled. This closes the underlying HTTP connection to the model provider and stops token generation. **Forbidden pattern**: waiting for the LiteLLM stream to complete naturally after receiving a cancellation signal. L1 calls may stream up to 30,000 tokens; ignoring cancellation continues token burn for the full remaining generation window despite the client being disconnected.

### 1.3 V2 Remote Sandbox (ADR-003)

- **MUST use**: E2B SDK with self-hosted gVisor/Firecracker infrastructure
- **NEVER use**: Modal, Lambda, shared containers, or any multi-tenant execution environment
- Every remote session maps to a single `remote_execution_sessions` row
- Session isolation: one container per job, destroyed after use
- Secure wipe must be verifiable: `secure_wipe_evidence` row must exist before terminal state is written

---

## 2. Tier Entitlement Rules ??Must Enforce at API Layer

### 2.1 Tier Matrix

> **[AGENT OVERRIDE DIRECTIVE]** Max tier context is **200K**, not 500K. Only Enterprise gets 1M. Do not revert.

| Feature | Free | Plus | Pro | Max | Enterprise |
|---------|------|------|-----|-----|-----------|
| Monthly credits | N/A (daily cap) | 280C | 650C | 1,500C | Contract |
| Daily job limit | 3/day | 8/day | 20/day | 40/day | Contract |
| Context window | 128K | 128K | 200K | 200K | 1M |
| Available models | L1 only | L1, L2 | L1, L2 | L1, L2, L3 | All |
| Mode | Simple | Simple | Professional | Professional | Enterprise |
| Cloud sandbox | ??| ??| ??| ??| Dedicated VPC |
| Web / GitHub surface | ??| ??| ??| ??| ??|
| Add-on credits | ??| ??| ??| ??| Contract |
| ROI Reports | ??| ??| ??| ??| ??|
| Concurrent jobs | 1 | 1 | 2 | 5 | Contract |

### 2.2 Credit System

**1 Credit (C) = $0.01 USD of actual API cost.** Credits are consumed dynamically based on real token usage. Prompt cache reads cost ??0% of standard input rate.

Credits are a **backend accounting unit only** ??never surface raw credit numbers as the primary UI layer. Use percentages and human-readable proxies (see `V1-FR-SUB-003`).

### 2.3 Enforcement Rules

1. **Two-layer quota gate before ANALYZING**:
   - Layer 1: today's job count < daily job limit.
   - Layer 2: remaining monthly credits ??10C minimum start threshold.
   - Free tier: Layer 1 only (no monthly credit layer).
   - Both layers checked atomically with distributed lock via `quota_reservations`.
   - Failure codes: `DAILY_JOB_LIMIT_REACHED` or `INSUFFICIENT_MONTHLY_BALANCE`.

2. **Cloud surface block for Free/Plus**: Any API call with a Free or Plus entitlement token attempting to start a web GitHub refactor or server sandbox job must be rejected with HTTP 403 and error code `ENTITLEMENT_INSUFFICIENT`.

3. **Model class gating**: A job requesting L2 or L3 model class on a tier that doesn't include it must be rejected at job creation time, not at execution time.

4. **Entitlement snapshot on job start**: Write an immutable `entitlement_snapshots` row at the moment of quota reservation. The job's billing truth is the snapshot, not the live subscription. Subscription downgrades mid-job do not affect running jobs.

5. **Idempotency key on all quota mutations**: Every `usage_ledger` insertion must carry an `idempotency_key` (job_id + model_class + attempt_number) to prevent double-counting on retry.

6. **In-flight job protection**: Once a job is in ANALYZING or beyond, it always runs to completion regardless of credit exhaustion. Only new job creation is blocked at zero balance.

7. **L3 confirmation gate**: Every L3 (Deep Fix) call requires explicit user confirmation showing estimated cost as % of remaining monthly balance. L3 never dispatches without this confirmation.

---

## 3. State Machine — Must Respect Exact Transitions

### 3.1 Canonical States (PRD V1 Section 13 — authoritative)

```
PENDING
  → ANALYZING                        (POST /api/v1/jobs/:id/start; quota reserved atomically)

ANALYZING
  → WAITING_STRATEGY                 (scope analysis complete — standard tiers)
  → GENERATING_ANALYSIS_REPORT       (Enterprise only; report generated before strategy screen)

GENERATING_ANALYSIS_REPORT
  → WAITING_STRATEGY                 (report artifact ready)

WAITING_STRATEGY
  → WAITING_SPEC_APPROVAL            (user selects strategy proposal)

WAITING_SPEC_APPROVAL
  → GENERATING_TESTS                 (user approves spec)

GENERATING_TESTS
  → BASELINE_VALIDATION              (tests generated)

BASELINE_VALIDATION
  → REFACTORING                      (baseline passed)
  → BASELINE_VALIDATION_FAILED       (baseline failed)

BASELINE_VALIDATION_FAILED
  → WAITING_SPEC_APPROVAL            (user selects "Revise Specs" — same job_id)

REFACTORING
  → SELF_HEALING                     (test failure during refactor loop)
  → DELIVERED                        (all tests pass on first attempt)
  → WAITING_ESCALATION_DECISION      (phase upgrade needed, no pre-authorization exists)

SELF_HEALING
  → DELIVERED                        (all tests pass within retry budget)
  → WAITING_INTERVENTION             (3 identical consecutive failures detected)
  → RECOVERY_PENDING                 (total retry budget exhausted)
  → WAITING_ESCALATION_DECISION      (phase upgrade needed, no pre-authorization exists)

WAITING_ESCALATION_DECISION
  → SELF_HEALING                     (user confirms escalation)
  → FAILED                           (timeout after 3600s; reason: ESCALATION_CONFIRMATION_TIMEOUT)

WAITING_INTERVENTION
  → DEEP_FIX_ACTIVE                  (user selects Deep Fix)
  → USER_INTERVENING                 (user selects Intervene)
  → SELF_HEALING                     (user selects Continue — no attempt counter reset)

DEEP_FIX_ACTIVE
  → SELF_HEALING                     (deep fix succeeded; attempt counter reset to 0)
  → WAITING_INTERVENTION             (deep fix failed)

USER_INTERVENING
  → SELF_HEALING                     (user runs tests and they pass)

RECOVERY_PENDING
  → FALLBACK_REQUIRED                (workspace restore + patch packaging succeeded)
  → FAILED                           (workspace restore failed)

FALLBACK_REQUIRED
  → WAITING_SPEC_APPROVAL            (user selects "Revise Specs and Rerun" — same job_id)

CLIENT_HEARTBEAT_LOST
  → FAILED                           (grace window expired; reason: CLIENT_DISCONNECTED)

Any non-terminal state
  → CLIENT_HEARTBEAT_LOST            (IDE-attached job: no heartbeat for 300s grace window)
  → FAILED                           (explicit user cancel or unrecoverable error)
```

**Terminal states** (no further transitions): `DELIVERED`, `FAILED`, `FALLBACK_REQUIRED` (unless user reruns)

### 3.2 Transition Rules

- **WAITING_INTERVENTION trigger**: Exactly 3 consecutive identical failures in SELF_HEALING. Reset counter on any non-identical failure or on "Continue" action.
- **DEEP_FIX_ACTIVE sequence**: Context purge for failing scope → first-principles re-analysis → L3 model upgrade confirmation gate (Max/Enterprise only; same dialog as V1-FR-ROUTE-002: estimated cost as % of remaining monthly balance; no L3 dispatch without explicit user confirmation) → generates new patch → attempt counter reset to 0. Pro users who select Deep Fix receive L2 escalation only; the L3 confirmation gate is never shown to Pro tier, and L3 is never dispatched.
- **Backward transition counter reset**: Any transition to `WAITING_SPEC_APPROVAL` originating from `BASELINE_VALIDATION_FAILED` (user selects "Revise Specs") or from `FALLBACK_REQUIRED` (user selects "Revise Specs and Rerun") must atomically reset `refactor_jobs.attempt_count = 0`, `identical_failure_count = 0`, and `failure_pattern_fingerprint = NULL` as part of the Temporal activity that handles the transition. This reset must happen before the workflow re-enters `WAITING_SPEC_APPROVAL`. Failure to reset these counters means a user who revises their spec will immediately exhaust the retry budget inherited from the prior failed attempt set.
- **Heartbeat and orphan handling**: IDE-attached jobs must emit heartbeat. On heartbeat loss, cloud token generation pauses immediately. Grace window = 300s. If restored before grace expiry: workflow resumes without terminal transition. If not restored: `CLIENT_HEARTBEAT_LOST` → `FAILED` (CLIENT_DISCONNECTED). Remote sandbox jobs (`REMOTE_SANDBOX` execution_mode) continue on disconnect per ADR-003.
- **No backward transitions to DELIVERED**: A DELIVERED job is immutable. Re-runs create a new job via `POST /api/v1/jobs`. Revert (`POST /api/v1/jobs/:id/delivery/revert`) does not change status — it applies a reverse patch to the workspace.
- **Cancellation = FAILED**: User cancellation always produces `status: FAILED` with `failure_reason: USER_CANCELLED`. There is no separate CANCELLED state.
- **QUOTA_RESERVING is a transient implementation sub-state** (not in PRD canonical list): Clients may briefly observe it between PENDING and ANALYZING. Must complete within 10 seconds. A stuck QUOTA_RESERVING job is failed after timeout.

### 3.3 State in Temporal vs Database

- Temporal workflow state is the source of truth for execution flow
- `refactor_jobs.status` in PostgreSQL is a denormalized read projection ??it must be updated by Temporal activities, not by application services directly
- Never update `refactor_jobs.status` without going through the Temporal signal/activity chain

---

## 4. Patch Edit Schema ??Must Not Use Line-Number Diffs

### 4.1 Required Format

All code edits produced by the system must use `patch_edit_schema`:

```typescript
type PatchEditOperation =
  | { op: "symbolic_replace"; symbol: string; new_body: string }
  | { op: "exact_search_replace"; search: string; replace: string; max_occurrences: 1 }
  | { op: "insert_after_symbol"; symbol: string; content: string }
  | { op: "delete_symbol"; symbol: string }
  | { op: "create_file"; path: string; content: string }
  | { op: "delete_file"; path: string };
```

### 4.2 Forbidden Patterns

- **NEVER produce**: Line-number-based diffs (`@@ -42,3 +42,5 @@` style unified diffs)
- **NEVER produce**: Whole-file replacements when a targeted edit is possible
- **NEVER produce**: Multiple `exact_search_replace` operations on the same search string in the same file (use `symbolic_replace` instead)

### 4.3 Why

Line-number diffs break on any upstream edit. The `patch_edit_schema` is AST-aware and position-independent. Agents that produce line-number diffs are producing artifacts that will fail in CI.

### 4.4 Storage

Each operation is stored as a row in `patch_edit_operations` linked to a `patch_attempts` row. The full edit set for an attempt is reconstructed by querying all operations for that attempt in sequence order.

---

## 5. API Contract Rules ??Must Follow Without Invention

### 5.1 Golden Rule

If an endpoint is not in `Docs/DEV/API_CONTRACT.md`, it does not exist yet. Do not implement, call, or document endpoints not in the contract. If you believe a new endpoint is needed, flag it for spec update.

### 5.2 Route Naming Conventions

- All routes are prefixed `/api/v1/` (V1) or `/api/v2/` (V2)
- Resource naming: plural nouns (`/jobs`, `/users`, `/artifacts`)
- Sub-resources use path nesting: `/jobs/:job_id/proposals`
- Actions on resources: POST to action path (`/jobs/:job_id/intervention/deep-fix`)
- No verbs in base resource paths (not `/createJob`, `/getUser`)

### 5.3 Error Response Format

Every error response must follow:

```json
{
  "error": {
    "code": "SNAKE_CASE_CODE",
    "message": "Human-readable English explanation",
    "details": {}
  }
}
```

Standard error codes (exact strings ??do not invent new ones without spec update):

| Code | HTTP Status | Meaning |
|------|------------|---------|
| `QUOTA_EXHAUSTED` | 429 | Quota limit reached for the current period |
| `ENTITLEMENT_INSUFFICIENT` | 403 | Tier does not include this feature |
| `JOB_NOT_OWNED` | 403 | Job belongs to a different user |
| `JOB_STATE_INVALID` | 409 | Requested action not valid in current job state |
| `REVISION_CONFLICT` | 409 | Spec revision token mismatch (concurrent edit) |
| `ARTIFACT_EXPIRED` | 410 | Artifact TTL exceeded |
| `IDEMPOTENCY_REPLAY` | 200 | Duplicate request replayed with original response |
| `RATE_LIMITED` | 429 | Too many requests in window |
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `INTERNAL_ERROR` | 500 | Unhandled server error (do not leak stack traces) |

### 5.4 Authentication

- All routes except `/auth/*` and `/health` require a valid JWT Bearer token
- JWT payload contains: `user_id`, `tier`, `org_id` (nullable), `iat`, `exp`
- Token lifetime: 15 minutes (access), 30 days (refresh)
- OAuth callback tokens are single-use, expire in 5 minutes
- Do not cache or log full JWT tokens

### 5.5 Streaming

- Job log streams use Server-Sent Events (SSE) at `GET /api/v1/jobs/:job_id/logs/stream`
- SSE event format: `data: {"type":"...", "payload":{...}}\n\n`
- WebSocket is not used for log streaming in V1 (do not implement WS for this)

---

## 6. Database Rules ??Must Follow Schema Exactly

### 6.1 Golden Rule

If a column is not in `Docs/DEV/DB_SCHEMA.md`, do not add it without a schema migration and spec update. If you need a new column, flag it.

**OAuth identity vs GitHub repository access**: `oauth_accounts` table stores user login identity (GitHub/Google OAuth login). `repository_connections` table (V2) stores GitHub repository access tokens for V2 web surface. Never store repository access tokens in `oauth_accounts`.

### 6.2 Critical Invariants

1. **Quota idempotency**: `quota_reservations.idempotency_key` is UNIQUE. Always insert with `ON CONFLICT DO NOTHING` and verify the row exists after.

2. **Entitlement snapshot immutability**: `entitlement_snapshots` rows are never updated after insertion. If a job's subscription changes, it does not affect the snapshot.

3. **Cross-org cache isolation**: `dependency_cache_index` queries must always include `org_id` in the WHERE clause. The schema has no cross-org foreign keys, but a missing filter would be a security vulnerability.

4. **Secure wipe prerequisite**: Before setting `remote_execution_sessions.status = 'COMPLETED'` or `'FAILED'`, verify a matching `secure_wipe_evidence` row exists. The `completed_at` column must be NULL until this check passes.

5. **Soft delete pattern**: Users are soft-deleted (`deleted_at` timestamp). Filter `WHERE deleted_at IS NULL` on all user queries. Hard deletes require GDPR erasure flow through `data_erasure_requests`.

6. **Audit trail**: All state-changing operations on `refactor_jobs`, `spec_revisions`, `patch_attempts` must produce a row in `audit_events`. Never skip audit logging for performance.

7. **Revision tokens**: `spec_revisions.revision_token` is UUID v4, generated server-side. Every spec update request must include the previous `revision_token`. Mismatch ??`REVISION_CONFLICT` (409).

### 6.3 Migration Discipline

- Every schema change needs a numbered migration file (e.g., `migrations/0042_add_rebase_validation.sql`)
- Migrations must be forward-only (no destructive rollback in migration files)
- Never `ALTER TABLE` in application startup code ??use migration runner only
- Test migrations against a copy of production schema before merging

---

## 7. Professional Mode ??Scope and Behavior

Professional Mode is available to Pro and Max tiers only. Key behavioral constraints:

1. **Scope**: V1.0 applies to same-ecosystem modernization jobs; cross-ecosystem is V1.x experimental only and must follow the approved source language matrix.
2. **Default strategy**: Same-ecosystem jobs default to AST-driven baseline. Black-Box Orchestration is used when AST confidence falls below threshold or when explicitly selected.
3. **Context window**: Pro = 200K, Max = 200K. Only Enterprise gets 1M context.
4. **Cross-surface spec locking**: Field-level optimistic locking is mandatory. Revision mismatch must return `SPEC_REVISION_CONFLICT` with diff payload.
5. **Deep Fix availability**: L3/Deep Fix is Max and Enterprise only, and every L3 call requires explicit user confirmation.

---

## 8. V2-Specific Rules

### 8.1 Web / GitHub Surface

- Draft PR is the **default** delivery method (V2-FR-WEB-005). Never create a ready-for-review PR without explicit user opt-in.
- GitHub OAuth token must be stored encrypted at rest (`github_token_encrypted` column). Never log or expose decrypted tokens.
- Repository connections are per-user (`repository_connections.user_id`). Enterprise orgs can have shared connections (`org_id` set) but individual user connections still belong to the user.
- Rebase validation must run before any delivery that targets an out-of-date branch (`rebase_validation_records`).

### 8.2 Remote Sandbox

- Container environment variables must never contain secrets at startup ??use E2B secret injection API instead
- `remote_execution_sessions.sandbox_metadata` is a JSONB column storing non-sensitive session config only
- All egress from sandbox containers is blocked except explicit allowlist (configured in E2B self-hosted infra, not in application code)
- Session logs stream through `GET /api/v2/jobs/:job_id/logs/stream` ??same SSE format as V1

### 8.3 Compliance (Enterprise)

- GDPR erasure: `POST /api/v2/compliance/data-erasure` creates a `data_erasure_requests` row. The actual erasure is an async Temporal workflow.
- Audit export: `POST /api/v2/compliance/audit-export` is available to Enterprise org admins only. Requires `org:audit:export` permission scope.
- Zero Telemetry Mode: When `organizations.zero_telemetry_mode = true`, all behavior telemetry events must be suppressed at the telemetry middleware layer. The metadata-only event `POST /api/v1/telemetry/event` must still accept requests but silently drop behavior fields.

---

## 8.5 Admin Console Rules — Must Enforce Role Checks

Admin endpoints use a **separate auth system** from the product JWT. Admin sessions are issued by `POST /api/v1/admin/auth/login` and stored in `admin_sessions`. The product `users` table and `admin_accounts` table are completely separate.

### Role Hierarchy

```
SUPER_ADMIN  — full access including admin account management and api_key_ref changes
ENGINEER     — technical config: model routing, feature flags, context caps, health dashboard
SUPPORT      — user-facing: user 360, quota adjustment, per-user kill switch, tickets
```

### Mandatory Role Enforcement Points

Every admin endpoint handler MUST:
1. Validate the bearer token against `admin_sessions` (check `expires_at`, `revoked_at`).
2. Load the admin's `role` from `admin_accounts`.
3. Reject with `HTTP 403 + error_code: "ROLE_INSUFFICIENT"` if role does not meet endpoint requirement.
4. Write an `audit_events` record for every state-changing action (config write, kill switch, quota adjust, account change).

### Dynamic Config — Forbidden Patterns

These are always wrong when implementing config write handlers:

❌ **Wrong**: Accepting raw API key strings in `PUT /api/v1/admin/config/model.l1` value field
✅ **Correct**: Config store only accepts secrets manager path references (e.g. `"secrets/litellm/minimax_api_key"`). The actual secret lives in AWS Secrets Manager, never in `dynamic_configs`.

❌ **Wrong**: Allowing ENGINEER role to update `model.l1.api_key_ref`
✅ **Correct**: Any key matching `*.api_key_ref` pattern requires `SUPER_ADMIN`. Enforce at the config write handler, not at the route level.

❌ **Wrong**: Immediately applying new `tier_context_caps` config value to running jobs
✅ **Correct**: Running jobs always read from their `entitlement_snapshots` row (immutable). New cap values take effect only on next job creation.

❌ **Wrong**: Storing admin session in the same `refresh_tokens` table as product users
✅ **Correct**: Admin sessions use `admin_sessions` table with 8-hour TTL. No refresh — re-authenticate after expiry.

❌ **Wrong**: Letting SUPPORT role set `scope: "GLOBAL"` on kill switch
✅ **Correct**: SUPPORT can only set `scope: "USER"` kill switches. Global scope requires SUPER_ADMIN or ENGINEER.

---

## 9. Common Hallucination Patterns ??Do Not Do These

The following patterns appear frequently in AI-generated code for this project and are **always wrong**:

### 9.1 State Machine Violations

❌ **Wrong**: Using simplified state names like `PROPOSING`, `AWAITING_APPROVAL`, `EXECUTING`, `TESTING`, `DELIVERING`, `COMPLETED`, `CANCELLED`, `INTERVENING`, `DEEP_FIX_PENDING`
✅ **Correct**: Use canonical PRD state names: `WAITING_STRATEGY`, `WAITING_SPEC_APPROVAL`, `REFACTORING`, `SELF_HEALING`, `BASELINE_VALIDATION`, `DELIVERED`, `USER_INTERVENING`, `DEEP_FIX_ACTIVE`. User cancellation → `FAILED` with reason `USER_CANCELLED` (no CANCELLED state).

❌ **Wrong**: Transitioning directly from `SELF_HEALING` to `FAILED` on first test failure
✅ **Correct**: Accumulate failures; only trigger `WAITING_INTERVENTION` on 3 identical consecutive failures

❌ **Wrong**: Allowing `DELIVERED → ANALYZING` (re-running a delivered job)
✅ **Correct**: DELIVERED jobs are immutable. Create a new job for re-runs.

❌ **Wrong**: Setting `refactor_jobs.status` directly via SQL UPDATE in application service code
✅ **Correct**: Status updates happen exclusively through Temporal activity results

### 9.2 Quota Violations

??**Wrong**: Checking quota after starting the job
??**Correct**: Reserve quota atomically before transitioning to `ANALYZING`

??**Wrong**: Using a simple SELECT COUNT query to check available quota
??**Correct**: Use the reservation table with distributed locking to prevent race conditions

??**Wrong**: Decrementing usage on job failure
??**Correct**: Reserved quota is consumed on job start (ANALYZING); it is NOT refunded on failure (only on cancellation before ANALYZING)

### 9.3 Patch Edit Violations

??**Wrong**: Producing unified diffs with line numbers
??**Correct**: Use `patch_edit_schema` operations only

??**Wrong**: Producing a `create_file` operation for a file that already exists
??**Correct**: Use `symbolic_replace` or `exact_search_replace` for existing files

### 9.4 Tier Enforcement Violations

??**Wrong**: Checking tier only in the UI and assuming the backend trusts it
??**Correct**: Every protected endpoint validates the JWT's `tier` claim server-side

??**Wrong**: Allowing Plus users to access cloud sandbox because "they're paying"
??**Correct**: Plus is local-only. Cloud sandbox requires Pro or above. HTTP 403 + `ENTITLEMENT_INSUFFICIENT`.

??**Wrong**: Using the current subscription at time of billing instead of the entitlement snapshot
??**Correct**: Read from `entitlement_snapshots` for all billing and limit calculations related to a running job

### 9.5 API Invention

❌ **Wrong**: Implementing `POST /api/v1/jobs/:job_id/retry` because it seems logical
✅ **Correct**: There is no retry endpoint. Re-runs create new jobs via `POST /api/v1/jobs`.

❌ **Wrong**: Using short paths like `/jobs`, `/auth/login`, `/github/connect` without version prefix
✅ **Correct**: All routes include full prefix — V1: `/api/v1/...`, V2: `/api/v2/...` (see API_CONTRACT.md Section 1).

❌ **Wrong**: Using `/api/v2/auth/oauth/github/initiate` for GitHub OAuth login
✅ **Correct**: Login OAuth initiation is a V1 route: `GET /api/v1/auth/oauth/github/initiate`. The V2 `/api/v2/github/connect` is for repository access, not user login.

❌ **Wrong**: Returning different error shapes for different services
✅ **Correct**: All services return the exact error format from Section 5.3 of this guide

### 9.6 Database Invention

❌ **Wrong**: Adding a `retry_count` column to `refactor_jobs` because it seems useful
✅ **Correct**: Retry tracking lives in `patch_attempts`. Do not add columns to existing tables without spec update.

❌ **Wrong**: Creating a `job_logs` table to store streaming logs
✅ **Correct**: Log streaming is ephemeral SSE from Temporal workflow history. No persistent log table in V1.

❌ **Wrong**: Adding `oauth_provider` / `oauth_provider_id` fields to the `users` table
✅ **Correct**: Third-party login identity is stored in the `oauth_accounts` table (one row per provider per user). The `users` table only has core identity fields.

❌ **Wrong**: Inserting to `usage_ledger` without an `idempotency_key`
✅ **Correct**: Every `usage_ledger` row requires `idempotency_key` in format `{job_id}:{model_class}:{attempt_number}`. Use `ON CONFLICT (idempotency_key) DO NOTHING`.

❌ **Wrong**: Querying `payment_subscriptions` to check if a user is allowed to access a feature
✅ **Correct**: Query `subscription_tiers` for all entitlement decisions. `payment_subscriptions` is gateway-mirror only.

### 9.7 LLM Call Violations

??**Wrong**: `import Anthropic from "@anthropic-ai/sdk"; client.messages.create(...)`
??**Correct**: `fetch("http://litellm-proxy/v1/chat/completions", { ... })`

??**Wrong**: Implementing retry logic for model calls in application code
??**Correct**: LiteLLM handles retries and circuit-breaking. Application code sees a single response.

---

## 10. Testing Requirements

### 10.1 Every New Feature Needs

1. **Unit tests** for business logic (state transitions, quota calculations, entitlement checks)
2. **Integration tests** for API endpoints (happy path + error cases from Section 5.3)
3. **Contract tests** for any external service integration (Temporal, LiteLLM, E2B, Stripe)

### 10.2 Required Test Cases for Quota System

- Double-spend prevention: Two concurrent requests for the last available quota slot ??exactly one succeeds
- Idempotency replay: Same idempotency key sent twice ??second returns `IDEMPOTENCY_REPLAY` with original response
- Entitlement snapshot isolation: Subscription downgrade mid-job ??job continues at original entitlement

### 10.3 Required Test Cases for State Machine

- Happy path: CREATED ??COMPLETED for each tier
- WAITING_INTERVENTION trigger: exactly 3 identical failures, not 2, not 4
- Deep Fix: context purge clears previous attempt context; model upgrade applies to Pro+ only
- Orphan detection: job in non-terminal state with no heartbeat for 300s ??orphaned

### 10.4 Required Test Cases for V2

- Plus tier web/GitHub attempt ??HTTP 403 + `ENTITLEMENT_INSUFFICIENT`
- Draft PR default: delivery without explicit `create_as_ready: true` ??PR in draft state
- Secure wipe prerequisite: completing a remote session without wipe evidence ??error

---

## 11. Security Checklist

Before submitting any code touching auth, quota, or data access, verify:

- [ ] JWT validation is done before any business logic, not after
- [ ] User can only access their own jobs (`job.user_id == auth.user_id`)
- [ ] Org-scoped resources check `org_id` membership, not just `user_id`
- [ ] GitHub tokens are encrypted before storage, never logged
- [ ] SQL queries use parameterized inputs ??no string interpolation in WHERE clauses
- [ ] Telemetry events contain no PII (no file paths, no code content, no commit messages)
- [ ] Sandbox containers have no access to application secrets
- [ ] Error responses do not include stack traces, internal service URLs, or database errors

---

## 12. UX Integration Constraints

### 12.1 IDE Plugin

- Intervention UI uses **Command Panel** pattern (natural language input field at top of viewport), not chat bubbles (V1-FR-DEL-002)
- State badge must update in real-time via SSE subscription ??do not poll
- Progress indicator must display estimated completion based on phase, not a generic spinner

### 12.2 Web Interface

- Delivery is always Draft PR by default ??the "Create Ready PR" option must be an explicit secondary action
- GitHub OAuth connect flow must complete before any refactor job can be started from web surface
- Repository workspace selection must show branch staleness indicator if base branch has advanced

---

## Appendix A: Requirement ID Reference

All functional requirements referenced in this guide map to IDs in the PRDs:

| Requirement | Document Section | Description |
|-------------|-----------------|-------------|
| V1-FR-SUB-001??08 | PRD V1 禮5.2 | Subscription tier entitlements |
| V1-FR-RUN-001??07 | PRD V1 禮6.1 | Job execution rules |
| V1-FR-TEST-001??03A | PRD V1 禮6.3 | Testing and Deep Fix |
| V1-FR-PRO-001??03 | PRD V1 禮6.5 | Professional Mode |
| V1-FR-DEL-001??02 | PRD V1 禮6.4 | Delivery and intervention |
| V2-FR-ENT-001??03 | PRD V2 禮5.2 | V2 entitlement enforcement |
| V2-FR-WEB-001??05 | PRD V2 禮6.2 | Web/GitHub surface |
| V2-FR-RUN-001??07 | PRD V2 禮6.3 | Remote sandbox execution |
| V2-FR-COMP-001??04 | PRD V2 禮6.5 | Compliance (Enterprise) |

---

*This guide is the source of truth for agent behavior. When in doubt, read the spec. Do not invent. Do not assume. Do not extrapolate.*


