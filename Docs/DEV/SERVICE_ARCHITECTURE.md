# IAMA Service Architecture

**Version**: 1.0
**Last Updated**: 2026-02-22
**Status**: Authoritative reference — do not deviate without ADR update

---

## 1. System Overview

IAMA (Intelligent Autonomous Multi-surface Agent) is an AI-powered code refactoring platform with two product phases:

- **V1**: IDE-only, local sandbox execution, single-user model
- **V2**: Adds web/GitHub surface, remote cloud sandbox, multi-user enterprise org model

Both phases share the same backend monolith for V1 core services, with V2 adding isolated service extensions.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT SURFACES                          │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  IDE Plugin  │    │  Web App     │    │  Admin Portal    │  │
│  │  (VS Code,   │    │  (Next.js)   │    │  (Internal)      │  │
│  │   JetBrains) │    │              │    │                  │  │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘  │
└─────────┼───────────────────┼─────────────────────┼────────────┘
          │                   │                     │
          │    HTTPS / SSE    │                     │
          ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY / NGINX                        │
│              Rate limiting, TLS termination, routing            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│   Core API      │  │  Auth Service   │  │  Billing Service    │
│   (V1 + V2)     │  │  (JWT / OAuth)  │  │  (Stripe webhook)   │
│   Node.js /     │  │                 │  │                     │
│   Fastify        │  │                 │  │                     │
└────────┬────────┘  └─────────────────┘  └─────────────────────┘
         │
         │  Temporal SDK
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TEMPORAL.IO CLUSTER                          │
│              Workflow orchestration & state management          │
│                                                                 │
│  ┌─────────────────┐    ┌──────────────────────────────────┐   │
│  │ Job Orchestrator │    │ Temporal Workers                 │   │
│  │ Workflows       │    │ (Analysis, Planning, Execution,  │   │
│  │                 │    │  Testing, Delivery activities)   │   │
│  └─────────────────┘    └──────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
          ┌────────────────────┼──────────────────────┐
          ▼                    ▼                      ▼
┌──────────────────┐  ┌────────────────┐  ┌──────────────────────┐
│  LiteLLM Library │  │  PostgreSQL    │  │  E2B Self-Hosted     │
│  + IAMA Router   │  │  (Primary DB)  │  │  (V2 Remote Sandbox) │
│  (in Temporal    │  │                │  │  gVisor/Firecracker  │
│   Worker proc.)  │  │                │  │                      │
│                  │  │                │  │  gVisor/Firecracker  │
└──────────────────┘  └────────────────┘  └──────────────────────┘
```

---

## 3. Service Inventory

### 3.1 Core API Service

**Technology**: Node.js + Fastify (or equivalent performant HTTP framework)
**Responsibilities**:
- Serve all REST endpoints defined in `Docs/DEV/API_CONTRACT.md`
- Validate JWT tokens and extract entitlement claims
- Enforce tier entitlements at route level (before business logic)
- Create and signal Temporal workflows
- Stream SSE log events from Temporal workflow history
- Write audit events for all state-changing operations

**Key Characteristics**:
- Stateless — horizontal scaling via load balancer
- No direct model calls — all LLM calls go through LiteLLM Proxy
- No direct sandbox management — all sandbox calls go through E2B SDK
- Auth middleware runs before all route handlers

**Deployment**: Kubernetes deployment, minimum 2 replicas, autoscale on CPU/RPS

### 3.2 Auth Service

**Technology**: Embedded in Core API (not a separate process in V1)
**Responsibilities**:
- User registration and login
- JWT issuance (access: 15min, refresh: 30 days)
- OAuth 2.0 callback handling (GitHub, Google)
- Token refresh and logout (refresh token revocation)

**Security**:
- Passwords hashed with bcrypt (cost factor 12)
- JWT signed with RS256 (asymmetric key pair)
- Refresh tokens stored as hashed values in `users.refresh_token_hash`
- OAuth state parameter validated to prevent CSRF

### 3.3 Temporal Cluster

**Technology**: Temporal.io (self-hosted or Temporal Cloud)
**Responsibilities**:
- Durable workflow execution for all refactor jobs
- Activity retry with exponential backoff (configured per activity type)
- Workflow signal handling (user interventions, heartbeats, admin kill-switch)
- Timer-based orphan detection (300s heartbeat grace window)

**Workflow Types**:

| Workflow | Trigger | Description |
|---------|---------|-------------|
| `RefactorJobWorkflow` | `POST /api/v1/jobs/:id/start` | Main job orchestration for V1 |
| `DeepFixWorkflow` | WAITING_INTERVENTION + user selects Deep Fix | Context purge + re-analysis child workflow |
| `RevertWorkflow` | `POST /api/v1/jobs/:id/revert` | Creates and applies revert patch |
| `V2RemoteJobWorkflow` | V2 job start with remote sandbox | Extends RefactorJobWorkflow with E2B lifecycle |
| `DataErasureWorkflow` | `POST /api/v2/compliance/data-erasure` | GDPR erasure async processing |
| `AuditExportWorkflow` | `POST /api/v2/compliance/audit-export` | Enterprise audit export generation |

**Temporal Workers**:
- Workers poll Temporal task queues and execute activities
- Activities are stateless functions: analyze, plan, generate_patch, apply_patch, run_tests, deliver, etc.
- Each activity has a configured start-to-close timeout and retry policy
- Workers run in separate containers from the Core API

**Activity Timeout Reference**:

| Activity | Start-to-Close | Retry Policy |
|---------|---------------|-------------|
| `analyzeScope` | 5 min | 3 attempts, backoff 2x |
| `generateProposal` | 3 min | 2 attempts, no backoff |
| `generatePatch` | **30 min** | 2 attempts, backoff 2x; **Heartbeat every 30s mandatory** |
| `applyPatch` | 2 min | 3 attempts, immediate |
| `runTests` | 15 min | 1 attempt (test results are deterministic) |
| `deliverPatch` | 5 min | 3 attempts, backoff 2x |
| `provisionSandbox` (V2) | 3 min | 2 attempts, backoff 2x |
| `destroySandbox` (V2) | 2 min | 5 attempts, backoff 2x (wipe must complete) |

> **[TIMEOUT RATIONALE — generatePatch]** L1 model output cap is 30,000 tokens (see Section 3.4). At observed generation speeds of 20–40 tokens/sec, worst-case physical generation time is 12.5–25 minutes. A 10-minute Start-to-Close Timeout would interrupt legitimate streaming mid-generation. The 30-minute ceiling provides adequate headroom. **Heartbeat (30-second interval)** is the primary real-time failure detection mechanism for this activity — Temporal's heartbeat timeout should be set to 90 seconds (3× heartbeat interval) so a genuine disconnect is detected within 90 seconds rather than waiting 30 minutes. The generous Start-to-Close exists only to bound pathological stall cases, not normal operation.

### 3.4 LiteLLM Library + IAMA Router Module

**Technology**: LiteLLM Python library (`litellm` package) + custom IAMA Router Python module (`core/llm/`)

**Deployment**: Both layers are **in-process within the Temporal Worker** (Python). They are NOT a separate sidecar service, NOT a separate network hop, and NOT part of the Node.js Core API. The Core API (Node.js) never calls LiteLLM directly — it only dispatches Temporal workflow signals.

**Memory Budget for Large Context (Enterprise 1M)**:
When handling Enterprise-tier jobs with 1M token context windows, a single LiteLLM streaming call may accumulate 1M+ tokens in the input buffer before generation begins. At ~4 bytes/token, raw payload memory footprint approaches ~4 GB per concurrent activity. Temporal Workers must be provisioned with adequate memory to prevent OOM interference with the Heartbeat sender thread (which runs on a separate asyncio task). Recommended baseline for Enterprise-serving workers: **≥ 16 GB RAM per pod**. If memory pressure is detected (e.g., via RSS monitoring), Worker pods should be horizontally isolated for Enterprise traffic via a dedicated Temporal task queue (`enterprise-llm-queue`). This is an operational concern; the Core API routing tier is responsible for dispatching Enterprise jobs to the correct task queue.

**Responsibilities**:
- Receive all model call requests from Temporal activity functions
- Route to appropriate model provider and model variant based on tier/phase/context
- Implement circuit-breaking (automatic fallback on provider failure)
- Return token usage metrics for ledger recording

**IAMA Router Logic**:

```
Input: { user_tier, model_class, context_tokens }
Output: { provider, model, max_tokens, output_cap }

L1 (multi-vendor low-cost, e.g., MiniMax M2.5):
  → Stages: test_generation, refactor_generation, repair iter 1-3
  → All tiers
  → Output cap: 30,000 tokens (full file output permitted)

L2 (Sonnet-class, e.g., Claude Sonnet 4.6):
  → Stages: repair iter 4-6, fallback_conversation, BDD/SDD NL
  → Plus, Pro, Max, Enterprise only
  → Output cap: 5,000 tokens (patch_edit_schema ONLY)

L3 (Opus-class, e.g., Claude Opus 4.6):
  → Stages: Deep Fix only
  → Max, Enterprise only
  → Output cap: 5,000 tokens (patch_edit_schema ONLY)
  → Requires: explicit user confirmation before dispatch

Context cap by tier:
  Free/Plus: 128K
  Pro/Max:   200K   ← NOTE: Max is 200K, NOT 500K
  Enterprise: 1M
```

> **[AGENT OVERRIDE DIRECTIVE]** Max tier context is 200K. Do not revert to 500K.

**IAMA Router lives in the Temporal Worker process** as a Python module (`core/llm/`). It is called directly from Temporal activity functions. Application code specifies the routing key (`{ tier, phase, model_class }`), never the model name directly.

**Heartbeat-Loss → Streaming Cancellation (V1-FR-JOB-007 implementation requirement)**

When an IDE-attached job loses heartbeat, the Temporal workflow must cancel any in-flight LLM generation activities to stop cloud token billing. Because L1 calls stream up to 30,000 tokens, failing to cancel the asyncio task means continued token burn throughout the full remaining generation window.

Required signal propagation chain:
```
IDE heartbeat loss detected (Temporal timer expires after 300s grace)
  → Temporal signals activity cancellation to in-flight generation activity
  → Temporal Worker activity code:
      1. Detects Temporal cancellation (activity.is_cancelled() returns True on next chunk)
      2. Cancels the asyncio.Task wrapping litellm.acompletion(stream=True)
      3. asyncio.CancelledError propagates → underlying HTTP connection to model provider closes
      4. Activity raises CancelledError → Temporal marks activity CANCELLED
  → Cloud token generation stops; no further tokens billed
```

This propagation must be implemented in every Temporal activity that calls `litellm.acompletion()` with streaming enabled (`generatePatch`, `analyzeScope`, `generateProposal`). Activities that use non-streaming calls are exempt but must still handle Temporal cancellation by aborting after the current call completes.

**Spec-Change → In-flight Generation Cancellation (SELF_HEALING state)**

When a user modifies the BDD/SDD spec while the workflow is in `SELF_HEALING` or `REFACTORING` state (i.e., a patch is actively being generated), the system must abort the in-flight generation to prevent the stale-spec patch from being applied:

```
User submits PATCH /api/v1/jobs/:job_id/spec with valid revision_token
  → Core API commits new spec_revision to DB
  → Core API sends Temporal signal: specUpdatedDuringExecution
  → Temporal Workflow signal handler:
      1. Identifies any in-flight generatePatch / analyzeScope activity
      2. Issues activity cancellation (same asyncio.Task cancel path as heartbeat loss)
      3. Transitions job back to WAITING_SPEC_APPROVAL
  → New spec revision is presented to user for re-approval
  → Attempt counter and failure_pattern_fingerprint are reset atomically
```

This prevents the race condition where an in-flight patch based on the old spec is applied after the user has already committed a new spec version.

### 3.5 PostgreSQL

**Technology**: PostgreSQL 15+
**Responsibilities**:
- Primary data store for all entities (see `Docs/DEV/DB_SCHEMA.md`)
- Distributed locking for quota reservation (`pg_advisory_xact_lock`)
- Full-text search for audit event queries (if needed, use `pg_trgm`)

**Operational Rules**:
- One primary + one read replica minimum
- Connection pooling via PgBouncer (transaction mode)
- Migrations run via migration runner (not application startup)
- All sensitive columns encrypted at application layer before storage

### 3.6 E2B Self-Hosted Sandbox (V2 Only)

**Technology**: E2B SDK + self-hosted gVisor/Firecracker infrastructure
**Responsibilities**:
- Provision isolated container per remote refactor job
- Execute code and tests in secure isolation
- Stream execution output to workflow
- Enforce egress allowlist (no arbitrary internet access from sandbox)
- Destroy container on session completion + record wipe evidence

**Container Lifecycle**:

```
provisionSandbox activity
  → E2B SDK: create sandbox (timeout: 3 min)
  → Record sandbox_id in remote_execution_sessions

[Job execution phase]
  → Code runs inside container
  → Output streamed via E2B streaming API to Temporal workflow
  → Workflow forwards to SSE endpoint via Core API

destroySandbox activity
  → E2B SDK: destroy sandbox
  → Verify secure wipe (E2B returns wipe_evidence_token)
  → Write row to secure_wipe_evidence
  → Only then: update remote_execution_sessions.status → terminal
```

---

## 4. Data Flow: V1 Refactor Job (Happy Path)

```
1. User selects files in IDE plugin
2. IDE → POST /api/v1/jobs          → Core API
3. Core API validates JWT tier
4. Core API → INSERT refactor_jobs (status=PENDING)
5. Core API → Temporal: start RefactorJobWorkflow
6. Temporal activity: reserveQuota
   → INSERT quota_reservations (with distributed lock)
   → INSERT entitlement_snapshots
   → UPDATE refactor_jobs.status = QUOTA_RESERVING → ANALYZING
7. Temporal activity: analyzeScope
   → IAMA Router (in-process) → Model L1 (Phase 1)
   → Returns scope analysis
   → UPDATE refactor_jobs.status = WAITING_STRATEGY
8. Core API ← SSE log stream (events from Temporal workflow activities)
9. User selects strategy proposal
   → POST /api/v1/jobs/:job_id/proposals/select
   → Temporal signal: proposalSelected
   → UPDATE refactor_jobs.status = WAITING_SPEC_APPROVAL
10. User approves spec
    → POST /api/v1/jobs/:job_id/spec/approve
    → Temporal signal: specApproved
    → UPDATE refactor_jobs.status = GENERATING_TESTS → BASELINE_VALIDATION
11. Temporal activity: generatePatch (loop per file)
    → IAMA Router (in-process) → Model L2 (Phase 2)
    → INSERT patch_edit_operations
    → UPDATE refactor_jobs.status = REFACTORING
12. Temporal activity: applyPatch (local sandbox)
13. Temporal activity: runTests
    [Pass] → UPDATE status = DELIVERED
    [3 identical consecutive failures] → UPDATE status = WAITING_INTERVENTION
14. Core API notifies IDE via SSE
15. User chooses action (accept / Deep Fix / Intervene)
16. [Accept] → POST /api/v1/jobs/:job_id/delivery/apply
    → INSERT usage_ledger (with idempotency_key)
```

---

## 5. Data Flow: V2 Remote Job (Additional Steps)

```
[After step 6 in V1 flow]
7a. Temporal activity: provisionSandbox
    → E2B SDK: create isolated container
    → INSERT remote_execution_sessions (status=ACTIVE)

[Steps 11-13 run inside the remote container instead of local]
11a. Temporal activity: applyPatch (remote, inside container)
12a. Temporal activity: runTests (remote, inside container)
     → Output streamed via E2B → Temporal → SSE endpoint

[After step 16]
17. Temporal activity: destroySandbox
    → E2B SDK: destroy container
    → Verify wipe_evidence_token
    → INSERT secure_wipe_evidence
    → UPDATE remote_execution_sessions.status = COMPLETED
```

---

## 6. V2 GitHub Delivery Flow

```
User initiates GitHub delivery:
1. POST /api/v2/jobs/:id/delivery/github
2. Core API:
   a. Load repository_connections for user
   b. Fetch current branch HEAD from GitHub API
   c. INSERT branch_head_snapshots
   d. Run rebase validation (INSERT rebase_validation_records)
   e. If rebasing needed: run rebase, update snapshot
3. Temporal activity: createGitHubPR
   a. Decrypt github_token from repository_connections
   b. GitHub API: create branch from base
   c. GitHub API: commit patch changes
   d. GitHub API: create PR (draft=true by default)
   e. INSERT code_provenance_records (links job → PR)
   f. Return PR URL and number
4. Core API: UPDATE refactor_jobs.delivery_artifact_url
5. SSE notification to client
```

---

## 7. Concurrency and Consistency

### 7.1 Quota Reservation (Distributed Lock)

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('quota:' || user_id));
-- Check current usage
SELECT COUNT(*) FROM quota_reservations
WHERE user_id = $1
  AND period_start >= current_period_start
  AND status = 'ACTIVE';
-- If under limit: insert reservation
INSERT INTO quota_reservations (user_id, job_id, idempotency_key, ...)
VALUES ($1, $2, $3, ...)
ON CONFLICT (idempotency_key) DO NOTHING;
COMMIT;
```

### 7.2 Spec Revision Conflict (Optimistic Locking)

```sql
UPDATE spec_revisions
SET body = $new_body,
    revision_token = gen_random_uuid(),
    updated_at = now()
WHERE job_id = $job_id
  AND revision_token = $client_revision_token;
-- If 0 rows affected: REVISION_CONFLICT (409)
```

### 7.3 Cross-Org Cache Isolation

The `dependency_cache_index` schema enforces isolation at query time. Every cache lookup must include `org_id`:

```sql
SELECT * FROM dependency_cache_index
WHERE org_id = $org_id          -- MANDATORY — never omit
  AND package_name = $package
  AND version_range = $range;
```

---

## 8. Security Architecture

### 8.1 Trust Boundaries

```
UNTRUSTED: Client surfaces (IDE plugin, Web App, Admin Portal)
SEMI-TRUSTED: API Gateway (validates TLS, rate limits)
TRUSTED: Core API (validates JWT, enforces entitlements)
HIGHLY TRUSTED: Temporal Workers (run in internal network, no public exposure)
ISOLATED: E2B Sandbox containers (no access to internal network)
```

### 8.2 Secret Management

| Secret | Storage | Access |
|--------|---------|--------|
| JWT signing key (RS256) | Secrets manager (e.g., AWS Secrets Manager) | Auth Service only |
| Database credentials | Secrets manager | Core API, Temporal Workers |
| Stripe webhook secret | Secrets manager | Billing Service only |
| GitHub OAuth app secret | Secrets manager | Auth Service only |
| User GitHub tokens | PostgreSQL (encrypted column) | Core API via decrypt-on-use |
| E2B API key | Secrets manager | Temporal Workers (destroySandbox activity) |
| LiteLLM master key | Secrets manager | Temporal Workers (model call activities) |

### 8.3 Network Policy

- Core API → PostgreSQL: internal network only (no public exposure)
- Core API → Temporal: internal network only
- Temporal Workers → LiteLLM Proxy: internal network only
- Temporal Workers → E2B self-hosted: internal network only
- E2B containers: isolated network, egress blocked except explicit allowlist
- Admin Portal → Core API: internal VPN only

### 8.4 Telemetry Privacy

- Telemetry events contain metadata only: event type, tier, phase, duration
- No PII: no file paths, no code content, no commit messages, no user-identifiable data
- When `organizations.zero_telemetry_mode = true`: telemetry middleware drops all behavior fields before processing
- Telemetry events are never stored in the primary PostgreSQL database (separate telemetry sink)

---

## 9. V1 vs V2 Component Comparison

| Component | V1 | V2 |
|-----------|----|----|
| Job execution environment | Local IDE sandbox | Local (Plus/Free) or E2B remote (Pro/Max/Enterprise) |
| Delivery surface | File system (local apply) | File system + GitHub PR |
| GitHub integration | None | OAuth connect + PR creation |
| Multi-user support | Single user per installation | Enterprise org with team roles |
| Compliance | Minimal (soft delete) | GDPR erasure, audit export |
| Sandbox isolation | OS-level (user's machine) | gVisor/Firecracker (E2B) |
| Temporal workflows | RefactorJobWorkflow, DeepFixWorkflow, RevertWorkflow | + V2RemoteJobWorkflow, DataErasureWorkflow, AuditExportWorkflow |
| Database tables | 19 core tables | + 22 V2-specific tables (see DB_SCHEMA.md) |

---

## 10. Deployment Topology

### 10.1 V1 Production (Minimum Viable)

```
Load Balancer (HTTPS)
  ├── Core API × 2 pods (Node.js)
  └── Temporal Worker × 2 pods
        └── LiteLLM library + IAMA Router (in-process — NOT a separate pod)

PostgreSQL (Primary + 1 Replica)
PgBouncer (connection pooling)
Temporal Cluster (self-hosted or Temporal Cloud)
```

### 10.2 V2 Production (Additional)

```
[All V1 components]
  +
E2B Self-Hosted Control Plane
  ├── Firecracker VMM nodes (compute for sandboxes)
  └── gVisor kernel (optional additional isolation layer)

[Scaling considerations]
  Core API: scale on RPS (target: p99 < 100ms for non-streaming endpoints)
  Temporal Workers: scale on workflow backlog depth
  E2B nodes: scale on concurrent active sandbox sessions
```

### 10.3 Health Endpoints

| Endpoint | Returns | Checked By |
|---------|---------|-----------|
| `GET /health` | `{ status: "ok" }` | Load balancer |
| `GET /api/v1/admin/health-dashboard` | Detailed service status | Admin Portal |
| Temporal health | Temporal SDK native | Ops monitoring |
| E2B health | E2B SDK native | Ops monitoring |

---

## 11. Observability

### 11.1 Logging

- Structured JSON logs (not text)
- Log fields: `timestamp`, `level`, `service`, `trace_id`, `job_id` (if applicable), `user_id` (if applicable), `message`
- Never log: JWT tokens, database passwords, GitHub tokens, code content, file paths containing sensitive data
- Log levels: ERROR (alertable), WARN (notable), INFO (operational), DEBUG (development only)

### 11.2 Metrics

Key metrics to instrument:

| Metric | Type | Labels |
|--------|------|--------|
| `job_state_transitions_total` | Counter | `from_state`, `to_state`, `tier` |
| `quota_reservations_total` | Counter | `tier`, `phase`, `result` (success/exhausted) |
| `llm_request_duration_seconds` | Histogram | `phase`, `model` |
| `llm_tokens_total` | Counter | `tier`, `phase`, `model`, `type` (input/output) |
| `sandbox_provision_duration_seconds` | Histogram | (V2 only) |
| `api_request_duration_seconds` | Histogram | `method`, `route`, `status_code` |

### 11.3 Tracing

- Distributed tracing via OpenTelemetry
- Trace context propagated from API request → Temporal workflow → activities → LiteLLM call
- All activities include `job_id` and `user_id` as trace attributes

### 11.4 Alerting Thresholds

| Alert | Condition |
|-------|-----------|
| Job stuck in QUOTA_RESERVING | Job in state > 30 seconds |
| High WAITING_INTERVENTION rate | > 20% of jobs reaching WAITING_INTERVENTION in 1h window |
| LiteLLM circuit open | Any circuit breaker open > 60 seconds |
| Sandbox provision failure rate | > 5% failure rate over 5 minute window |
| API error rate | > 1% 5xx rate over 5 minute window |

---

## 12. Technology Stack Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| API Framework | Node.js + Fastify | Stateless, horizontally scalable |
| Workflow Engine | Temporal.io | ADR-001 — non-negotiable |
| LLM Proxy | LiteLLM (Python library) + IAMA Router module | ADR-002 — non-negotiable; in-process within Temporal Worker |
| Remote Sandbox | E2B (gVisor/Firecracker) | ADR-003 — non-negotiable (V2) |
| Database | PostgreSQL 15+ | Primary data store |
| Connection Pool | PgBouncer | Transaction mode |
| Web Frontend | Next.js (React) | V2 web surface |
| IDE Plugin | VS Code Extension API | V1/V2 IDE surface |
| Container Orchestration | Kubernetes | Production deployment |
| Service Mesh | (Optional) Istio or Linkerd | mTLS between services |
| Secrets Management | AWS Secrets Manager (or equivalent) | All service credentials |
| Observability | OpenTelemetry + Prometheus + Grafana | Metrics and tracing |

---

*This document defines the authoritative service architecture. Any deviations require an ADR. See `Docs/ADR/` for decision records.*
