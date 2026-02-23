# IAMA V1 Development Plan

## Overview

IAMA V1 is a production-grade AI-powered code refactoring product. It is **not** an MVP. It delivers an IDE-first (VS Code) workflow backed by a cloud control plane. All V2 items (remote sandbox, GitHub integration, multi-user org, GDPR compliance) are explicitly excluded from this plan.

**Core tech stack (non-negotiable per ADRs):**
- API: **Node.js + Fastify** (stateless, horizontally scalable)
- Workflow engine: **Temporal.io** Python SDK (ADR-001)
- LLM layer: **LiteLLM library + IAMA Router module** (in-process within Temporal Worker) (ADR-002)
- Database: **PostgreSQL 15+** + PgBouncer
- IDE: **VS Code Extension** (TypeScript)
- Web portal: **Next.js** (React) — auth, billing, usage only

---

## Pre-Implementation: Sprint 0 — PoC Validation

> **Blocking**: All backend sprint work is blocked until PoC #1 and PoC #2 pass.

| # | PoC | Scope | Effort | Blocking |
|---|-----|-------|--------|---------|
| P1 | Dual-language schema sync (Node.js API ↔ Python Temporal Worker) | Verify Prisma or OpenAPI codegen keeps types consistent across Node.js and Python | 3–4 days | All backend work |
| P2 | `patch_edit_schema` apply mechanism | Validate `EXACT_SEARCH_REPLACE` across all V1 target languages; `AST_SYMBOLIC` for Python + TypeScript only | 5–7 days | All patch delivery + self-healing work |
| P3 | Cross-ecosystem Black-Box mode | **Not required for V1.0** — V1.x experimental only | — | Future only |
| P4 | E2B Snapshot/CoW | **V2 only** — out of scope | — | V2 only |

**PoC exit criteria:**
- P1 pass: A shared type (e.g., `JobStatus` enum) defined once is consumable from both Node.js API handlers and Python Temporal activities without manual duplication.
- P2 pass: A 500-line Python file and a 500-line TypeScript file can have functions replaced via `symbolic_replace` and string blocks via `exact_search_replace`, with verified output matching expected results.

---

## V1 Delivery Phases

### Phase 1 — Infrastructure Foundation
**Goal**: All cross-cutting infrastructure is runnable and testable. Feature slices depend on this phase.

#### 1.1 Repository Setup & DevEnv
- Monorepo structure: `/api` (Node.js), `/worker` (Python Temporal), `/extension` (VS Code), `/web` (Next.js), `/migrations`
- Docker Compose: PostgreSQL, PgBouncer, Temporal Server (self-hosted), Core API, Temporal Worker
- Migration runner wiring (e.g., `golang-migrate` or `db-migrate`); **no `ALTER TABLE` in app startup**
- Structured JSON logging configured for all services
- OpenTelemetry setup: trace context propagation API → Temporal Workflow → Activities → LiteLLM call

#### 1.2 Database — V1 Core Tables (Migrations)
All 19 V1 core tables defined in `DB_SCHEMA.md` Sections 2–11 + Section 19.

Priority order (dependency-safe):
1. `users`, `oauth_accounts`
2. `subscription_tiers`, `payment_subscriptions`
3. `usage_ledger`, `quota_reservations`
4. `projects`, `refactor_jobs`
5. `job_artifacts`
6. `bdd_items`, `sdd_items`, `spec_revisions`
7. `test_runs`, `patch_attempts`, `patch_edit_operations`
8. `audit_events`
9. `support_ticket_logs`
10. `client_heartbeat_sessions`
11. `billing_checkpoint_records`
12. `dynamic_configs`
13. `admin_accounts`, `admin_sessions`

> **Note**: `entitlement_snapshots` is labelled V2 in `DB_SCHEMA.md` Section 14, but it is referenced in V1 billing logic (`V1-FR-BIL-004`). Must confirm whether to create the table in V1 or implement a V1-specific snapshot mechanism. **→ Open Question #1**

#### 1.3 Temporal Scaffolding
- Temporal Server in Docker Compose using official `temporalio/server` image, PostgreSQL as persistence store
- `run_worker.py` — registers `RefactorJobWorkflow`, `DeepFixWorkflow`, `RevertWorkflow`
- Activity stubs: `analyzeScope`, `generateProposal`, `generatePatch`, `applyPatch`, `runTests`, `deliverPatch`, `reserveQuota`, `releaseQuota`
- Heartbeat wiring: every streaming activity (`generatePatch`, `analyzeScope`, `generateProposal`) wraps `litellm.acompletion` in `asyncio.Task` with Temporal cancellation check on each chunk
- Signal definitions: `proposalSelected`, `specApproved`, `specUpdatedDuringExecution`, `heartbeatReceived`, `interventionAction`

#### 1.4 LiteLLM + IAMA Router (`core/llm/`)
- `IamaLLMRouter.route(tier, stage, model_class)` → resolves provider alias from `IAMA_LLM_ROUTE_TABLE` DynamicConfig
- Entitlement gating before call (reject L2/L3 for unauthorized tiers)
- Token cap enforcement: L1 = 30,000, L2/L3 = 5,000 (post-generation validation)  
- Streaming (`stream=True`) required for all L1 calls
- Prompt caching headers for stable context segments (Tier 1: system prompt + AST interfaces; Tier 2: BDD/SDD spec)
- JSON repair pass (`jsonrepair` library) before schema validation
- Circuit-breaking (built into LiteLLM Router)
- Audit event emission per call: model_class, stage, tier, cache_hit/miss, success/failure
- `usage_ledger` insert with idempotency_key after every call

#### 1.5 Auth Service (embedded in Core API)
- JWT RS256 keypair (15 min access, 30 days refresh)
- Refresh tokens stored as bcrypt hash in `users.refresh_token_hash` (column to add) **→ Open Question #2**
- Auth middleware: validates Bearer JWT before all route handlers; extracts `user_id`, `tier`, `org_id`

#### 1.6 Dynamic Config Service
- `dynamic_configs` table read-through at startup, cached with TTL
- Seed data: `model.l1`, `model.l2`, `model.l3`, `tier_context_caps`, `feature.*`, `system.kill_switch.*`, `language_matrix`
- Running jobs always read from `entitlement_snapshots` (immutable); new config takes effect on next job creation

#### 1.7 Audit Events & Telemetry Infrastructure
- `audit_events` writer middleware — every state-changing operation on `refactor_jobs`, `spec_revisions`, `patch_attempts` writes an audit row
- Telemetry sink (separate from PostgreSQL) — structured metadata-only events; no PII
- `POST /api/v1/telemetry/events` endpoint with server-side PII guard

---

### Phase 2 — Auth, Subscription, and Billing Core
**Goal**: Users can register, log in via email/password and OAuth, view their plan, and the payment webhook pipeline is live.

#### 2.1 Auth Endpoints
| Endpoint | Requirement |
|----------|------------|
| `POST /api/v1/auth/register` | V1-FR-AUTH-001 |
| `POST /api/v1/auth/login` | V1-FR-AUTH-001 |
| `POST /api/v1/auth/refresh` | V1-FR-AUTH-004 |
| `POST /api/v1/auth/logout` | — |
| `GET /api/v1/auth/oauth/github/initiate` | V1-FR-AUTH-002 |
| `GET /api/v1/auth/oauth/google/initiate` | V1-FR-AUTH-002 |
| `GET /api/v1/auth/oauth/callback` | V1-FR-AUTH-002 (email-merge policy) |

OAuth auto-merge policy (from `API_CONTRACT.md` Section 2, `agent.md` Resolution 20): auto-merge on verified email, create separate account on unverified.

#### 2.2 Subscription & Usage Endpoints
| Endpoint | Requirement |
|----------|------------|
| `GET /api/v1/subscription/me` | V1-FR-SUB-001 |
| `GET /api/v1/usage/summary` | V1-FR-SUB-003 |
| `GET /api/v1/usage/job/:job_id` | V1-FR-SUB-002 |

Usage display policy: never surface raw credit counts as primary UI. Primary = progress bar + percentage + human-readable proxy ("~18 typical refactors remaining").

#### 2.3 Billing & Payment
| Endpoint | Requirement |
|----------|------------|
| `GET /api/v1/billing/plan` | V1-FR-PAY-005 |
| `POST /api/v1/billing/checkout` | V1-FR-PAY-001 |
| `POST /api/v1/webhooks/payment` | V1-FR-PAY-002 (idempotent; `last_webhook_event_id` check) |
| `GET /api/v1/billing/usage-report` | V1-FR-PAY-004 |

Webhook handles: `payment_succeeded` → grant quota, `payment_failed` → lock premium, `subscription_cancelled` → downgrade, `subscription_renewed` → refresh quota.

#### 2.4 Quota Enforcement Engine
- Two-layer gate before `ANALYZING`: (1) daily job count < limit, (2) remaining monthly credits ≥ 10C
- Free tier: Layer 1 only
- `quota_reservations` insert with `pg_advisory_xact_lock` (see `SERVICE_ARCHITECTURE.md` Section 7.1)
- `entitlement_snapshots` written atomically before job enters ANALYZING
- Idempotency key format: `{user_id}:{billing_cycle}:{job_id}` for reservations
- Add-on behavior: +25% monthly add-on → daily limit × 1.25 (rounded up)

---

### Phase 3 — Job Lifecycle & Proposal/Spec
**Goal**: A job can be created, analyzed, proposals returned, BDD/SDD edited, and spec approved. The entire Temporal workflow is orchestrated through `WAITING_SPEC_APPROVAL`.

#### 3.1 Job Endpoints
| Endpoint | Requirement |
|----------|------------|
| `POST /api/v1/jobs` | V1-FR-JOB-001 (execution_mode check for Free/Plus → no REMOTE_SANDBOX) |
| `GET /api/v1/jobs` | V1-FR-JOB-002 |
| `GET /api/v1/jobs/:job_id` | V1-FR-JOB-002 (with heartbeat fields) |
| `POST /api/v1/jobs/:job_id/start` | Quota reservation atomically |
| `DELETE /api/v1/jobs/:job_id` | USER_CANCELLED → FAILED |
| `POST /api/v1/jobs/:job_id/heartbeat` | V1-FR-JOB-007 |
| `POST /api/v1/jobs/:job_id/force-terminate` | V1-FR-JOB-007 Addendum |

#### 3.2 Workspace Preflight (V1-FR-JOB-004)
- Before job start: check workspace dirty state
- Segment A output: simplified `Continue (safe mode)` / `Cancel` (no raw git output)
- Segment B output: full VCS status
- `LOCAL_NATIVE` mode: VCS checkpoint check — `LOCAL_NATIVE_NO_VCS_CHECKPOINT` error if no clean tree/stash/commit

#### 3.3 Context Builder (in Temporal Worker)
- File allowlist filter: reject binaries, compiled assets, minified bundles (entropy heuristics) — `V1-FR-CTX-007`
- `.iamaignore` file support — `V1-FR-SEC-004`
- AST-based dependency expansion (Python + TypeScript for V1.0): include interface/type slices, not just file paths — `V1-FR-CTX-001`
- Semantic dependency prioritization over file-size ordering — `V1-FR-CTX-002`
- Context manifest generation (included slices + inclusion reasons) — `V1-FR-CTX-003`
- Context size check vs tier cap (128K/200K); if over cap: AST pruning on non-target files — `V1-FR-CTX-004`
- If still over cap after pruning: fail fast with `CONTEXT_SIZE_EXCEEDED` — `V1-FR-CTX-005`
- Secret scanning before payload leaves IDE — `V1-FR-SEC-003`

#### 3.4 AST Confidence Score
Score formula: `round(0.40 × parse_rate + 0.35 × symbol_rate + 0.25 × snippet_completeness) × 100`
- ≥ 40: proceed with AST_SYMBOLIC
- 20–39: auto-trigger Black-Box Orchestration mode (user can override)
- < 20: EXACT_SEARCH_REPLACE only

#### 3.5 Proposal Endpoints
| Endpoint | Requirement |
|----------|------------|
| `GET /api/v1/jobs/:job_id/proposals` | V1-FR-SPEC-001 (exactly 3 levels: CONSERVATIVE, STANDARD, COMPREHENSIVE) |
| `POST /api/v1/jobs/:job_id/proposals/select` | V1-FR-SPEC-001 |

Professional Mode proposals (Pro/Max/Enterprise): include `technical_analysis`, `estimated_complexity`, comparative performance metrics (V1-FR-PRO-001).

Enterprise Analysis Report: generated during `GENERATING_ANALYSIS_REPORT` state (Enterprise only), exposed via `GET /api/v1/jobs/:job_id/enterprise-report` (V1-FR-PRO-002).

#### 3.6 Spec (BDD/SDD) Endpoints
| Endpoint | Requirement |
|----------|------------|
| `GET /api/v1/jobs/:job_id/spec` | V1-FR-SPEC-002 |
| `PATCH /api/v1/jobs/:job_id/spec` | V1-FR-SPEC-002, V1-FR-SPEC-003 (with `revision_token` optimistic lock) |
| `POST /api/v1/jobs/:job_id/spec/nl-convert` | V1-FR-SPEC-002 (NL → BDD/SDD preview via L2; not committed) |
| `POST /api/v1/jobs/:job_id/spec/approve` | V1-FR-SPEC-002 |

Spec revision conflict: `SPEC_REVISION_CONFLICT` (409) with diff_payload when revision_token mismatch.

Spec change during in-flight generation: `specUpdatedDuringExecution` Temporal signal → activity cancellation → `WAITING_SPEC_APPROVAL` + counter reset (agent.md Resolution 18).

Expert Fast-Track (Segment B, Pro+ only): bypasses manual spec approval; implicit specs must still be persisted and version-stamped (V1-FR-SPEC-005). Does NOT bypass baseline validation.

#### 3.7 SSE Log Stream
`GET /api/v1/jobs/:job_id/logs` — `text/event-stream`
- Auth: `@microsoft/fetch-event-source` (no native EventSource; no URL query tokens)
- Events: `state_change`, `log_line`, `attempt_start`, `attempt_end`, `heartbeat_status`, `deep_fix_start`, `spec_updated`, `artifact_ready`
- Token refresh/resume within ≤ 5s p95 — `V1-FR-AUTH-004`

---

### Phase 4 — Test Generation, Baseline Validation & Refactor Loop
**Goal**: Full `GENERATING_TESTS → BASELINE_VALIDATION → REFACTORING → SELF_HEALING` Temporal workflow is functional.

#### 4.1 Temporal Workflow — Main Execution Path
State machine (exact canonical states from PRD Section 13):
```
PENDING → ANALYZING → [GENERATING_ANALYSIS_REPORT (Enterprise)] → WAITING_STRATEGY
→ WAITING_SPEC_APPROVAL → GENERATING_TESTS → BASELINE_VALIDATION
  → BASELINE_VALIDATION_FAILED (→ WAITING_SPEC_APPROVAL, counter reset)
  → REFACTORING
    → SELF_HEALING
      → WAITING_INTERVENTION (3 identical consecutive failures)
      → WAITING_ESCALATION_DECISION (phase upgrade, no pre-auth)
      → RECOVERY_PENDING → FALLBACK_REQUIRED
    → DELIVERED
  → DELIVERED
```

**Activity timeout config (from SERVICE_ARCHITECTURE.md Section 3.3):**

| Activity | Start-to-Close | Retry | Heartbeat |
|---------|---------------|-------|-----------|
| `analyzeScope` | 5 min | 3x, backoff 2x | Heartbeat mandatory |
| `generateProposal` | 3 min | 2x | Heartbeat mandatory |
| `generatePatch` | **30 min** | 2x, backoff 2x | **30s interval, Temporal HB timeout = 90s** |
| `applyPatch` | 2 min | 3x | — |
| `runTests` | 15 min | 1x | — |
| `deliverPatch` | 5 min | 3x | — |

#### 4.2 Test Generation (`GENERATING_TESTS`)
- L1 model, `test_plan_schema` output
- Generates assertion-based test suite from approved BDD/SDD spec
- Required schema families: `test_plan_schema`

#### 4.3 Baseline Validation (`BASELINE_VALIDATION`)
Two approved paths (V1-FR-TEST-005):
1. **Assertion-based baseline** — runs generated tests against legacy code; must pass
2. **Characterization/snapshot baseline** — persists legacy I/O artifacts (V1-FR-TEST-006)

Black-Box Orchestration mode (V1-FR-TEST-009): available when AST confidence < 40% (auto) or user explicitly selects. Generates orchestration tests against CLI/HTTP/DB-state instead of AST-level unit binding. Displays: AST confidence score, covered vs uncovered behaviours, user acknowledgement gate.

Baseline failure → `BASELINE_VALIDATION_FAILED`:
- User can select `Quarantine / Mock Overrides` (technical users) — audit trail required
- User can `Revise Specs` → `WAITING_SPEC_APPROVAL` (counter atomically reset)

#### 4.4 Refactor Loop (`REFACTORING` → `SELF_HEALING`)
- L1 model, `patch_plan_schema` / `patch_edit_schema` output
- File hash snapshot at job start; base-hash validation before patch apply (V1-FR-JOB-006)
- Non-destructive default: patches staged as artifact, not direct overwrite (V1-FR-JOB-005)
- **Retry cascade** (V1-FR-ROUTE-003):
  - Iterations 1–3: L1
  - Iterations 4–6 (Plus+): L2 (`patch_edit_schema` ONLY, 5K token cap)
  - Iterations 7+ (Max+): L2 escalation or L3
- **Identical failure detection** (V1-FR-TEST-003): fingerprint = test names + error class + failure location hash tracked per attempt. 3 consecutive identical → `WAITING_INTERVENTION`
- `WAITING_INTERVENTION` timeout: 1800s (30 min) → FAILED with `INTERVENTION_TIMEOUT` (agent.md Resolution 17)
- Timeout failures: classified `TIMEOUT_EXECUTION` (distinct from `LOGIC_FAILURE`) (V1-FR-TEST-008)
- On `TIMEOUT_EXECUTION`: user gets choices `increase_timeout`, `skip_or_quarantine_test`, `continue_repair` (V1-FR-SBX-007)

#### 4.5 Deep Fix Workflow (`DEEP_FIX_ACTIVE`)
Triggered from `WAITING_INTERVENTION` when user selects Deep Fix:
1. Clear LLM context for failing scope
2. Re-read original legacy source + original test + target spec (no prior repair history in context)
3. Max/Enterprise only: L3 confirmation gate (show estimated cost as % of remaining balance; block L3 without explicit confirmation)
4. Pro: L2 escalation only; no L3 confirmation dialog shown to Pro
5. Generate new patch; attempt counter reset to 0
6. SSE event: `deep_fix_start { context_reset: true, model_upgraded: boolean }`

#### 4.6 Phase Escalation (`WAITING_ESCALATION_DECISION`)
- `WAITING_ESCALATION_DECISION` timeout: 3600s → FAILED with `ESCALATION_CONFIRMATION_TIMEOUT` if no pre-authorization
- Pre-authorization at job start: if present, escalation proceeds without blocking
- Entitlement: `ENTITLEMENT_DENIED_PHASE` for unauthorized phase access

#### 4.7 Local Sandbox Execution
**Local Docker** (V1-FR-SBX-001): preferred isolation
**Local Native** (V1-FR-SBX-001, V1-FR-SBX-004): isolated child process
- Timeout: 30s default, user-configurable in VS Code settings (V1-FR-SBX-005)
- Forced termination on timeout; timeout = test failure → self-healing path (V1-FR-SBX-004)
- Side-effect warning acknowledgement + VCS checkpoint verification before first execution (V1-FR-SBX-006)
- Error: `LOCAL_NATIVE_NO_VCS_CHECKPOINT` if no clean tree/stash/commit
- Docker-not-available: degrade gracefully to Local Native (V1-FR-SBX-003)
- Sandbox output paths separate from source paths (V1-FR-SBX-002)

---

### Phase 5 — Delivery, Fallback, Revert & Heartbeat
**Goal**: Jobs can reach terminal states (`DELIVERED`, `FALLBACK_REQUIRED`, `FAILED`) with proper artifact handling, diff delivery, revert support, and heartbeat management.

#### 5.1 Delivery
| Endpoint | Requirement |
|----------|------------|
| `GET /api/v1/jobs/:job_id/delivery` | V1-FR-DEL-001 |
| `POST /api/v1/jobs/:job_id/delivery/apply` | V1-FR-DEL-005 (partial accept at file/hunk level) |
| `POST /api/v1/jobs/:job_id/delivery/revert` | V1-FR-DEL-007 |

Delivery requirements:
- Diff reconstructed from full target files after edit application (V1-FR-DEL-004) — not line-number unified diff
- Base-hash validation before patch apply; block on hash mismatch (V1-FR-JOB-006)
- Partial acceptance: file-level for AST-symbolic jobs; hunk-level when unified diff available
- Revert: reserve-patch apply to workspace; if user committed, block automated revert + provide `Download Reverse Patch` + warning (V1-FR-DEL-007)
- Artifact expiry: `artifact_expires_at` shown explicitly (default 14 days); email reminder 48h before expiry (V1-FR-DEL-008)
- Segment A: Complexity Warning screen for high-complexity changes before apply (V1-FR-DEL-006)

#### 5.2 Fallback Evidence Surface
| Endpoint | Requirement |
|----------|------------|
| `GET /api/v1/jobs/:job_id/fallback` | V1-FR-DEL-002 |
| `POST /api/v1/jobs/:job_id/intervention/deep-fix` | V1-FR-TEST-003A |
| `POST /api/v1/jobs/:job_id/intervention/command` | V1-FR-DEL-002 |
| `POST /api/v1/jobs/:job_id/intervention/run-tests` | V1-FR-DEL-002 |

Fallback UI must contain (NOT free-form chat):
- Failed test names, error excerpts, failure pattern fingerprint
- Recovery action buttons: `Retry with higher model` | `Edit spec` | `Download partial artifact` | `Report issue`
- Single-line spec clarification field (inline, not chat thread)

#### 5.3 Billing Checkpoint
- Pre-`GENERATING_TESTS` disconnect → non-billable (release reservation)
- At/after `GENERATING_TESTS` disconnect → billable committed; artifact remains retrievable via `job_id` (V1-FR-BIL-006)
- `billing_checkpoint_records` written at state entry
- Infra failure always dominates Client Disconnect in billing determination (agent.md Resolution 24)

#### 5.4 Heartbeat & Orphan Detection
- IDE client polls `POST /api/v1/jobs/:job_id/heartbeat` (suggested interval: 30s)
- Heartbeat loss → immediate cloud token generation pause
- 300s grace window → `CLIENT_HEARTBEAT_LOST`
- Grace expiry without recovery → `FAILED` with `CLIENT_DISCONNECTED`
- During grace period: SSE event `heartbeat_status { status: "GRACE_PERIOD", grace_deadline_at }` + IDE shows countdown UI + `Force Terminate Job` button
- Heartbeat-loss streaming cancellation: asyncio.Task cancellation in Temporal activity (MUST close HTTP connection to provider)

---

### Phase 6 — Admin Console, Operator Controls & Support
**Goal**: Operators can manage users, adjust quotas, control model routing, and create/monitor support tickets.

#### 6.1 Admin Auth (separate from product auth)
| Endpoint | Requirement |
|----------|------------|
| `POST /api/v1/admin/auth/login` | email/password only; 8h session token |
| `POST /api/v1/admin/auth/logout` | revoke session |
| `GET /api/v1/admin/auth/me` | — |
| `PATCH /api/v1/admin/auth/me/password` | min 12 chars |

Admin sessions use `admin_sessions` table (NOT product `users`/`refresh_tokens`). No OAuth.

#### 6.2 Admin Account Management (SUPER_ADMIN only)
| Endpoint | Action |
|----------|--------|
| `GET /api/v1/admin/accounts` | List admin accounts |
| `POST /api/v1/admin/accounts` | Create ENGINEER or SUPPORT admin |
| `PATCH /api/v1/admin/accounts/:admin_id` | Update role/status |
| `POST /api/v1/admin/accounts/:admin_id/reset-password` | Force reset |

SUPER_ADMIN cannot be created via API — bootstrap only.

#### 6.3 Operator Controls
| Endpoint | Role | Requirement |
|----------|------|------------|
| `GET /api/v1/admin/users/:user_id` | Any admin | V1-FR-OPS-004 |
| `PATCH /api/v1/admin/quota/:user_id` | SUPER_ADMIN, SUPPORT | V1-FR-OPS-003 |
| `POST /api/v1/admin/kill-switch` | SUPER_ADMIN/ENGINEER (global); + SUPPORT (per-user) | V1-FR-OPS-002 |
| `GET /api/v1/admin/config` | SUPER_ADMIN, ENGINEER | V1-FR-OPS-001 |
| `PUT /api/v1/admin/config/:key` | SUPER_ADMIN, ENGINEER (api_key_ref = SUPER_ADMIN only) | V1-FR-OPS-001 |
| `GET /api/v1/admin/health` | SUPER_ADMIN, ENGINEER | V1-FR-OPS-004 |

Config store rules:
- `*.api_key_ref` keys: store secrets manager path only (e.g., `"secrets/litellm/minimax_api_key"`); never raw secret (DB invariant #19)
- All config writes: produce `audit_events` row

#### 6.4 Support
| Endpoint | Requirement |
|----------|------------|
| `POST /api/v1/support/tickets` | V1-FR-SUP-002 (one-click from FAILED/FALLBACK_REQUIRED state in IDE) |

Enterprise default: metadata-only payload unless org admin enables contextual sharing (V1-FR-SUP-005).
Explicit user consent recorded before sending context to support (V1-FR-SUP-004).

---

### Phase 7 — VS Code Extension & Web Portal

#### 7.1 VS Code Extension (TypeScript)
IDE screen inventory (from PRD Section 14.3):
1. **Login handoff screen** — opens browser OAuth; receives `vscode://iama.extension/auth?token=...` deep link
2. **Job setup & target selection** — file/folder picker, execution profile selector with risk labels
3. **Strategy selection panel** — 3-level cards; Segment A: plain-language summary; Pro mode: technical metrics
4. **Spec Workbench** — BDD + SDD natural-language editor; revision timeline; inline spec clarification field (NOT chat bubbles)
5. **Execution console** — live SSE log stream; attempt timeline; heartbeat countdown during grace period; `Force Terminate Job` button
6. **Delivery diff view** — file-level and hunk-level partial accept; Segment A: Complexity Warning for high-complexity diffs
7. **Fallback intervention workspace** — evidence surface + action buttons (not chat bubbles); Deep Fix confirmation dialog
8. **Usage summary drawer** — progress bar + % + human-readable proxy; hover/expand for details

Technical requirements:
- SSE via `@microsoft/fetch-event-source` (not native EventSource)
- Token refresh/resume for long-lived SSE (≤ 5s p95)
- Heartbeat emitter: POST heartbeat every 30s during active local jobs
- `.iamaignore` file support
- State badge updates real-time via SSE (no polling)
- First-run: consent screen, execution profile selection, data-processing disclosure

Usage display policy enforcement:
- Never show raw credit numbers as primary UI
- Primary: progress‌ bar + percentage + human-readable proxy
- Hover/expand only: absolute remaining credits, daily jobs remaining, reset time

#### 7.2 Web Portal (Next.js)
Web screen inventory (from PRD Section 14.4):
1. **Sign in / register** — email/password + OAuth login
2. **Plan and billing** — current tier, entitlements, upgrade path, Stripe portal link
3. **Usage analytics** — credit usage per billing cycle, per-job breakdown, dollar amounts (paid tiers)
4. **Account security** — password change, OAuth connections view
5. **Job history and audit viewer** — job list with status, artifact expiry, fallback evidence

- **Does NOT include** web-based code editing or GitHub integration (V2 out of scope)
- Checkout redirect to Stripe/LemonSqueezy; customer portal access for invoice download

#### 7.3 Admin Portal (Internal)
Admin screen inventory (from PRD Section 14.5):
1. **User 360 and quota override workspace**
2. **System health and model routing configuration**
3. **Feature flag and kill switch control panel**

---

## Module Dependency Graph (Build Order)

```
Sprint 0 PoCs (P1, P2 must pass before Phase 1 proceeds)
  ↓
Phase 1: Infrastructure Foundation
  ├── 1.1 Repo setup, Docker Compose, migrations runner
  ├── 1.2 DB migrations (V1 core tables)
  ├── 1.3 Temporal scaffolding + activity stubs
  ├── 1.4 LiteLLM + IAMA Router
  ├── 1.5 Auth service
  ├── 1.6 Dynamic config service
  └── 1.7 Audit events + telemetry infra
  ↓
Phase 2: Auth + Subscription + Billing core
  ├── 2.1 Auth endpoints
  ├── 2.2 Subscription + usage endpoints
  ├── 2.3 Billing + payment webhook
  └── 2.4 Quota enforcement engine
  ↓
Phase 3: Job Lifecycle + Proposal + Spec
  ├── 3.1 Job endpoints
  ├── 3.2 Workspace preflight
  ├── 3.3 Context builder
  ├── 3.4 AST confidence scoring
  ├── 3.5 Proposal endpoints
  ├── 3.6 Spec (BDD/SDD) endpoints
  └── 3.7 SSE log stream
  ↓
Phase 4: Test Generation + Baseline + Refactor Loop
  ├── 4.1 Temporal main workflow (full state machine)
  ├── 4.2 Test generation activity
  ├── 4.3 Baseline validation (assertion + characterization + Black-Box)
  ├── 4.4 Refactor loop + self-healing (L1→L2 cascade)
  ├── 4.5 Deep Fix workflow
  ├── 4.6 Phase escalation (`WAITING_ESCALATION_DECISION`)
  └── 4.7 Local sandbox runner (Docker + Native)
  ↓
Phase 5: Delivery + Fallback + Revert + Heartbeat
  ├── 5.1 Delivery endpoints (diff, apply, revert)
  ├── 5.2 Fallback evidence surface
  ├── 5.3 Billing checkpoint
  └── 5.4 Heartbeat + orphan detection
  ↓
Phase 6: Admin + Operator + Support
  ├── 6.1 Admin auth (separate)
  ├── 6.2 Admin account management
  ├── 6.3 Operator controls (config, kill switch, quota)
  └── 6.4 Support ticket integration
  ↓
Phase 7: VS Code Extension + Web Portal
  ├── 7.1 VS Code Extension (all 8 screens)
  └── 7.2 Web portal (5 screens)
```

---

## V1 Release Gates (from PRD Section 17)
1. No P0 defects open
2. No unauthorized data access vulnerability
3. All P0 acceptance criteria validated in staging

### Key P0 Test Groups Required
- Auth and account flows (token consistency: V1-FR-AUTH-003)
- Subscription enforcement (two-layer quota gate, race condition prevention)
- Cross-user authorization isolation (V1-FR-JOB-002)
- State machine transitions (all canonical states, no invented state names)
- Baseline gate enforcement (mandatory before refactor loop)
- Retry loop correctness (3-identical-failure → WAITING_INTERVENTION)
- Heartbeat/orphan behavior (grace period, CLIENT_HEARTBEAT_LOST, billing checkpoint)
- Patch apply reliability (base-hash validation, pruning-resilient edits)
- Token cap enforcement + AST pruning + fail-fast overflow
- `patch_edit_schema` only — no line-number unified diffs
- Payment webhook idempotency
- Admin RBAC enforcement

---

## Open Questions / Clarifications Required

> **Please answer these before implementation begins.**

### Q1 — `entitlement_snapshots` in V1
The `DB_SCHEMA.md` places `entitlement_snapshots` in Section 14 (labeled "V2 Remote Execution Entities"), but `V1-FR-BIL-004` and `AGENT_DEVELOPMENT_GUIDE.md` Section 2.3 (Rule 4) require an immutable entitlement snapshot at job start time for V1 billing integrity.

**Question**: Should `entitlement_snapshots` be created as a V1 table (Phase 1 migration)? Or is there a simpler V1-only alternative?

**Recommendation**: Create it in V1. The billing requirement (`entitlement_snapshots` before ANALYZING) is explicitly P0 in `AGENT_DEVELOPMENT_GUIDE.md`. The "V2" label in DB_SCHEMA appears to be a section-grouping artifact, not a gating decision.

---

### Q2 — Refresh Token Storage Column
`SERVICE_ARCHITECTURE.md` Section 3.2 says refresh tokens are stored as hashed values in `users.refresh_token_hash`, but the `users` table in `DB_SCHEMA.md` Section 2 does not have a `refresh_token_hash` column. There is also no `refresh_tokens` table defined in V1 schema.

**Question**: Should refresh tokens be stored in a dedicated `refresh_tokens` table (one row per active session, supports multiple device sessions), or is a single `refresh_token_hash` column on `users` acceptable (single session per user)?

**Recommendation**: A dedicated `refresh_tokens` table is significantly better (multi-device support, per-token revocation, clean audit trail). But this is a schema addition not in `DB_SCHEMA.md` — needs a spec update before implementation.

---

### Q3 — UX Design Documents Missing
`agent.md` and `DEVELOPMENT_WORKFLOW.md` list `Docs/UX/UX-DESIGN-SYSTEM.md`, `Docs/UX/UX-WIREFRAME-IDE.md`, and `Docs/UX/UX-WIREFRAME-WEB.md` as required reading before building VS Code extension and web portal UX. These files were not provided for review.

**Question**: Are these UX documents available? Phase 7 (VS Code Extension + Web Portal) cannot be fully specified without them.

---

### Q4 — Support Ticketing Provider
`V1-FR-SUP-001` requires integration with at least one ticketing provider (Zendesk, Intercom, or Jira Service Management).

**Question**: Which ticketing provider has been selected? This affects the integration module and webhook setup in Phase 6.

---

### Q5 — Email Service Provider
`V1-FR-SEC-001` requires a transactional email service (welcome, payment receipt, quota exhaustion, suspicious login).

**Question**: Which email provider has been selected (e.g., SendGrid, Postmark, AWS SES, Resend)?

---

### Q6 — Payment Gateway
`V1-FR-PAY-001` requires a production payment gateway. Stripe and LemonSqueezy are both mentioned in docs. The `subscription_tiers.payment_gateway` column supports both.

**Question**: Stripe or LemonSqueezy? Or both from the start? This affects webhook handler implementation.

---

### Q7 — Telemetry/Analytics Provider
`V1-FR-ANA-001` through `V1-FR-ANA-005` require a product analytics system. PRD suggests PostHog (self-hosted) as an implementation option.

**Question**: PostHog self-hosted confirmed? Or another provider?

---

### Q8 — Temporal Hosting for V1 Production
`ADR-001` says: "V1 Production: evaluate Temporal Cloud vs continued self-host based on operational overhead assessment before V1 GA."

**Question**: Temporal Cloud subscription confirmed, or will V1 prod self-host Temporal? This affects infrastructure cost and setup time for Phase 1.

---

### Q9 — Secrets Manager
`SERVICE_ARCHITECTURE.md` references AWS Secrets Manager as the example. `dynamic_configs.api_key_ref` stores path references into a secrets manager.

**Question**: AWS Secrets Manager confirmed? Or will another provider be used (e.g., HashiCorp Vault, GCP Secret Manager)?

---

### Q10 — `LOCAL_NATIVE` Timeout VCS Re-validation Scope
`V1-FR-SBX-006` states VCS checks must be "re-validated if the user resumes a job after leaving and re-entering Native mode."

**Question**: Does "re-entering Native mode" mean: (a) only when the user explicitly switches execution profile in settings, or (b) every time the job is resumed after any disconnect?

**Recommendation**: Clarify before implementing the Native mode VCS guard, as the two interpretations lead to significantly different UX paths.
