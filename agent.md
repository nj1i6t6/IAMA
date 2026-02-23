# IAMA Agent Operating Contract

Objective: Develop the project based on Docs\plan\task.md.
Constraint 1: Do not report progress until all tasks are 100% complete.
Constraint 2: No execution environment. Do not attempt to run, debug, or test the code. Focus strictly on implementation according to the documentation.
Permission: Full administrative access granted for all file operations.

Version: `2.2`  
Last Updated: `2026-02-23`  
Scope: All AI agents and automation working in this repository

## 1. Purpose
This file defines mandatory agent behavior for IAMA.

Primary objective:
1. Prevent requirement drift.
2. Prevent hallucinated APIs, schema, and workflow behavior.
3. Enforce spec-first implementation.

Normative keywords in this document:
1. `MUST` = non-negotiable.
2. `SHOULD` = strongly recommended.
3. `MAY` = optional.

## 2. Read-Before-Code Rule
Before writing code, migrations, or contracts, an agent MUST read these files in order:

1. `Docs/IAMA_PRODUCT_REQUIREMENTS_V1_EN.md`
2. `Docs/IAMA_PRODUCT_REQUIREMENTS_V2_EN.md`
3. `Docs/DEV/API_CONTRACT.md`
4. `Docs/DEV/DB_SCHEMA.md`
5. `Docs/ADR/ADR-001-Workflow-Engine.md`
6. `Docs/ADR/ADR-002-LLM-Proxy.md`
7. `Docs/ADR/ADR-003-V2-Sandbox-Execution.md`
8. `Docs/DEV/SERVICE_ARCHITECTURE.md`
9. `Docs/UX/UX-DESIGN-SYSTEM.md`
10. `Docs/UX/UX-WIREFRAME-IDE.md`
11. `Docs/UX/UX-WIREFRAME-WEB.md`
12. `Docs/DEV/AGENT_DEVELOPMENT_GUIDE.md`
13. `Docs/DEV/DEVELOPMENT_WORKFLOW.md`
14. `Docs/plan/implementation_plan.md` *(V1 phase breakdown and dependency order)*
15. `Docs/plan/task.md` *(V1 task checklist with completion status)*

The agent MUST map every change to one or more requirement IDs.
The agent MUST execute delivery steps using `Docs/DEV/DEVELOPMENT_WORKFLOW.md`.
The agent SHOULD consult `Docs/plan/implementation_plan.md` to confirm the current phase context and dependency order before starting any module implementation.

## 3. Source-of-Truth Precedence
If documents conflict, resolve in this exact order:

1. PRD EN files (`V1_EN`, `V2_EN`)
2. ADR files (`Docs/ADR/*.md`)
3. `Docs/DEV/API_CONTRACT.md`
4. `Docs/DEV/DB_SCHEMA.md`
5. `Docs/DEV/SERVICE_ARCHITECTURE.md`
6. `Docs/DEV/AGENT_DEVELOPMENT_GUIDE.md`
7. UX files (`Docs/UX/*.md`)

If conflict cannot be resolved by precedence, the agent MUST stop and escalate.

## 4. Non-Negotiable Architecture Decisions
The agent MUST NOT violate these:

1. Workflow orchestration is `Temporal` (ADR-001).
2. Model calls are `LiteLLM + IAMA Router`, never direct provider SDK calls (ADR-002).
3. V2 remote sandbox path is `E2B self-hosted` (gVisor to Firecracker path), not shared generic runtime (ADR-003).

## 5. Hard Guardrails
The agent MUST NOT:

1. Invent API endpoints not defined in `Docs/DEV/API_CONTRACT.md`.
2. Invent DB tables/columns not defined in `Docs/DEV/DB_SCHEMA.md`.
3. Bypass entitlement, quota reservation, or ownership checks.
4. Use line-number unified diffs as authoritative apply payload.
5. Replace required routing/orchestration technologies without a superseding ADR.
6. Build default chatbot-style UI as the primary UX pattern.

The agent MUST:

1. Use `patch_edit_schema` for patch operations.
2. Keep all denial/error decisions machine-readable.
3. Keep telemetry metadata-only per PRD policy.

## 6. Known Spec Mismatches and Resolutions
All items below are fully resolved in the relevant source files. Follow the resolution exactly.

### 6.1 Original resolutions
1. Max context cap:
   - Conflict: `DB_SCHEMA` comments previously mentioned `500000`.
   - Resolution: Max tier is `200K`. Enterprise is `1M`. DB_SCHEMA comment corrected.
2. Error response shape:
   - Conflict between API contract examples and guide examples.
   - Resolution: External API response format MUST follow `Docs/DEV/API_CONTRACT.md` Section 12.
3. Workflow state naming:
   - Conflict between PRD state names and guide shorthand names.
   - Resolution: Use PRD Section 13 canonical state names. `AGENT_DEVELOPMENT_GUIDE.md` Section 3.1 updated.
4. Route prefix wording:
   - Conflict in textual examples.
   - Resolution: All routes in `Docs/DEV/API_CONTRACT.md` now include full prefix (`/api/v1/` or `/api/v2/`). These are authoritative.
5. Version labels in docs:
   - Conflict between index labels and some file headers.
   - Resolution: Requirement IDs and normative section content are authoritative.

### 6.2 Additional resolutions (2026-02-22 audit)
6. LiteLLM Router deployment location:
   - Conflict: `SERVICE_ARCHITECTURE.md` used "sidecar" language; `ADR-002` said in-process Python module.
   - Resolution: IAMA Router is a **Python module within the Temporal Worker process** (`core/llm/`). NOT a sidecar, NOT a separate service. `SERVICE_ARCHITECTURE.md` updated.
7. `usage_ledger` missing idempotency_key:
   - Conflict: `AGENT_DEVELOPMENT_GUIDE.md` mandated idempotency_key on every ledger insert; `DB_SCHEMA.md` had no such column.
   - Resolution: `idempotency_key TEXT NOT NULL UNIQUE` added to `usage_ledger`. Format: `{job_id}:{model_class}:{attempt_number}`. Insert with `ON CONFLICT DO NOTHING`.
8. OAuth user identity storage:
   - Conflict: Users can login via GitHub/Google OAuth but `users` table had no OAuth identity fields.
   - Resolution: New `oauth_accounts` table added (`DB_SCHEMA.md` Section 2). One row per provider per user. Distinct from `repository_connections` (V2 repo access tokens).
9. OAuth initiate endpoint missing:
   - Conflict: Auth flow defined callback but not the initiation step.
   - Resolution: `GET /api/v1/auth/oauth/github/initiate` and `GET /api/v1/auth/oauth/google/initiate` added to `API_CONTRACT.md` Section 2.
10. `subscription_tiers` vs `payment_subscriptions` role ambiguity:
    - Conflict: Two tables with overlapping fields; no defined authority for entitlement queries.
    - Resolution: `subscription_tiers` = IAMA internal entitlement authority (use for all access control). `payment_subscriptions` = payment gateway mirror (idempotency only). See `DB_SCHEMA.md` Invariants 16–17.
11. `zero_telemetry` column name inconsistency:
    - Conflict: Multiple files referenced `zero_telemetry`; DB column is `zero_telemetry_mode`.
    - Resolution: All references updated to `zero_telemetry_mode`. `SERVICE_ARCHITECTURE.md` corrected.
12. Workflow state name divergence in `AGENT_DEVELOPMENT_GUIDE.md`:
    - Conflict: Section 3.1 used non-PRD names (`PROPOSING`, `AWAITING_APPROVAL`, `EXECUTING`, `TESTING`, `DELIVERING`, `COMPLETED`, `CANCELLED`).
    - Resolution: Section 3.1 rewritten to PRD canonical states. Old names listed in Section 9.1 as hallucination patterns to avoid.
13. `SERVICE_ARCHITECTURE.md` Deployment Topology listed LiteLLM as a separate pod:
    - Conflict: Section 10.1 showed `LiteLLM Proxy × 1 pod` as an independent pod, contradicting ADR-002 (in-process) and Resolution #6 above.
    - Resolution: Topology updated — LiteLLM library is annotated as embedded within `Temporal Worker` pods. There is no separate LiteLLM pod.
14. `SERVICE_ARCHITECTURE.md` Data Flow used non-canonical state names:
    - Conflict: Section 4 (V1 Data Flow) used `CREATED`, `PROPOSING`, `PLANNING`, `EXECUTING`, `TESTING`, `DELIVERING`, `COMPLETED` — none of which are PRD canonical states.
    - Resolution: Section 4 updated to canonical states: `PENDING`, `WAITING_STRATEGY`, `WAITING_SPEC_APPROVAL`, `GENERATING_TESTS`, `BASELINE_VALIDATION`, `REFACTORING`, `DELIVERED`. Also corrected API endpoints and LiteLLM references in the same section.
15. Admin console RBAC and model routing controls were unspecified:
    - Gap: No admin role system existed; `dynamic_configs.updated_by` referenced `users` (wrong); no defined config key namespace for model routing.
    - Resolution: Added `admin_accounts` + `admin_sessions` tables (`DB_SCHEMA.md` Section 19) with 3 roles: `SUPER_ADMIN`, `ENGINEER`, `SUPPORT`. Defined config key namespace in `DB_SCHEMA.md` Section 8.1. Updated `API_CONTRACT.md` Section 6 with admin auth endpoints, account management endpoints, and per-endpoint role requirements. `api_key_ref` config keys require `SUPER_ADMIN`; actual secrets must never enter the config store. Admin sessions are separate from product user sessions (8h TTL, no refresh). Tier context caps and model output token limits are runtime-configurable via config store.
 16. `generatePatch` Activity Start-to-Close Timeout was set to 10 minutes:
     - Conflict: L1 max output is 30,000 tokens; at 20–40 tokens/sec, physical generation time reaches 25 minutes, exceeding the 10-minute limit. Legitimate streaming would be force-killed mid-generation.
     - Resolution: `generatePatch` Start-to-Close updated to **30 minutes** in `SERVICE_ARCHITECTURE.md` Section 3.3. Heartbeat interval must be **30 seconds**; Temporal Heartbeat Timeout must be configured to **90 seconds** (3× interval) for real-failure detection without waiting the full 30 minutes.
 17. L3 Deep Fix confirmation dialog — timeout behavior undefined:
     - Gap: When the user opens the L3 confirmation dialog and never responds, the Temporal Workflow had no defined timeout, leaving it permanently suspended.
     - Resolution: `WAITING_INTERVENTION` wait for Deep Fix confirmation MUST use a Temporal Timer of **1800 seconds (30 minutes)**. On expiry: transition to `FAILED` with `reason: INTERVENTION_TIMEOUT`. No quota charged. `billing_checkpoint_records` written with `charge_policy: NON_BILLABLE_DISCONNECT`.
 18. SELF_HEALING state: Spec change during in-flight LLM generation — cancellation path undefined:
     - Gap: State machine had no Temporal Signal for aborting in-progress LiteLLM streaming when a new spec revision is committed while in `SELF_HEALING` or `REFACTORING`.
     - Resolution: Core API MUST send `specUpdatedDuringExecution` Temporal Signal after committing new `spec_revisions`. Signal handler cancels in-flight activity via asyncio.Task cancellation; transitions to `WAITING_SPEC_APPROVAL`; resets attempt counter and `failure_pattern_fingerprint`. Full sequence in `SERVICE_ARCHITECTURE.md` Section 3.4.
 19. SSE endpoint authentication — native EventSource cannot send Authorization headers:
     - Gap: Native browser `EventSource` does not support custom headers. Passing tokens in URLs is prohibited (recorded in logs).
     - Resolution: Clients MUST use `@microsoft/fetch-event-source` instead of native `EventSource`. URL query parameter tokens are **prohibited**. Documented in `API_CONTRACT.md` Section 5. IDE extension clients (Electron/Node.js) are exempt.
 20. OAuth callback — Email collision strategy undefined:
     - Gap: No document defined behavior when OAuth provider email matches an existing email/password account.
     - Resolution: **Auto-merge** when provider email is verified (create `oauth_accounts` row for existing `users.id`; existing password preserved). Create separate account when email is absent or unverified. Manual account linking is V2 scope. Documented in `API_CONTRACT.md` Section 2.
 21. Natural language to BDD/SDD conversion — no API endpoint defined:
     - Gap: PRD required NL-based spec editing but `PATCH /spec` only accepted structured `BDDItem[]`, giving frontend no implementation path.
     - Resolution: Added `POST /api/v1/jobs/:job_id/spec/nl-convert` to `API_CONTRACT.md` Section 5. Returns structured preview only (not committed). Uses L2 model. Frontend presents preview for user review before submitting `PATCH /spec`.
 22. AST confidence score — calculation formula undefined:
     - Gap: Threshold config existed but no formula defined, making prompt engineering and backend validation impossible.
     - Resolution: Defined in `IAMA_PRODUCT_REQUIREMENTS_V1_EN.md` Section 5.1. Formula: `round(0.40 × parse_rate + 0.35 × symbol_rate + 0.25 × snippet_completeness) × 100`. Tiers: ≥40 = AST-symbolic; 20–39 = Black-Box (overridable); <20 = EXACT_SEARCH_REPLACE only.
 23. GitHub App Installation Token — 1-hour expiry, no auto-refresh mechanism specified:
     - Gap: Token comment noted "short-lived, refreshed via installation_id" but no activity defined when/how refresh occurs. Long V2 jobs risk 401 mid-execution.
     - Resolution: GitHub API-calling activities check token age before each call; if >50 minutes old, refresh via `Octokit.createAppAuth`. 401 mid-call triggers one refresh attempt; failure → `GITHUB_TOKEN_REFRESH_FAILED` → revocation cleanup. Documented in `API_CONTRACT.md` Section 8.
 24. Billing dual-failure edge case — simultaneous client disconnect and E2B infrastructure failure:
     - Gap: `BIL-006` (disconnect after point-of-no-return = charge) and `BIL-002` (infra failure = no charge) conflict when both occur simultaneously. No tiebreaker rule existed.
     - Resolution: **`INFRA_FAILURE` always dominates `CLIENT_DISCONNECTED`.** Check `remote_execution_sessions.status` first at terminal billing time. If `FAILED` → `INFRA_FAILURE`, no charge, regardless of `billing_checkpoint_records.charge_policy`. Documented in `DB_SCHEMA.md` Section 11 and Schema Invariant 23.

## 7. Required Pre-Implementation Checklist
Before implementation, the agent MUST produce:

1. Requirement Trace:
   - Requirement IDs
   - impacted API endpoints
   - impacted DB entities
   - impacted workflow states/transitions
   - acceptance criteria mapping
2. Scope tag:
   - `V1 only`, `V2 only`, or `V1+V2 shared`
3. Risk notes:
   - security impact
   - billing/quota impact
   - backward compatibility impact

## 8. Implementation Workflow
For each change, the agent MUST execute:

1. Analyze requirements and map IDs.
2. Validate against API and DB contracts.
3. Implement the smallest valid vertical slice.
4. Add or update tests (including at least one failure-path test).
5. Validate state-machine legality and entitlement gates.
6. Update docs touched by the change.

## 9. Validation Checklist Before Delivery
The agent MUST verify:

1. No undefined endpoint/table/column was introduced.
2. Requirement Trace is complete.
3. Machine-readable `error_code` and denial reasons are present where required.
4. Key reliability tests pass:
   - quota race/double-spend protection
   - ownership isolation
   - state transition guards
   - long-lived stream token refresh behavior
5. Security and privacy checks pass:
   - no secret leakage in logs
   - metadata-only telemetry
   - enterprise metadata-only support default

## 10. Stop-and-Escalate Conditions
The agent MUST stop and ask for clarification when:

1. A required behavior is missing from spec.
2. Multiple authoritative docs conflict with no deterministic resolution.
3. A new public API or new schema entity is needed but not specified.
4. An ADR-mandated technology would need to be replaced.

Escalation message MUST include:
1. Exact conflicting files and sections.
2. Candidate options.
3. Recommended option and risk tradeoff.

## 11. Agent Definition of Done
An agent task is complete only when all are true:

1. Requirements, API contract, DB schema, and state machine are aligned.
2. Tests provide acceptance evidence.
3. Documentation is updated and traceable to requirement IDs.
4. No unresolved assumptions remain undocumented.

## 12. Development Plan Documents

The following files contain the authoritative V1 development plan, phase breakdown, and task tracking.

### 12.1 File Locations

| File | Path | Purpose |
|------|------|---------|
| V1 Development Plan | `Docs/plan/implementation_plan.md` | Phase-by-phase breakdown with dependency order and technical clarifications |
| V1 Task Checklist | `Docs/plan/task.md` | Granular task list with `[ ]` / `[x]` completion tracking |
| Supplementary Detail | `Docs/plan/Supplementary information/` | Extended notes and resolved discussions (fallback if primary plan files are absent or incomplete) |

### 12.2 Usage Rules

1. If `Docs/plan/implementation_plan.md` is absent or empty, the agent MUST look in `Docs/plan/Supplementary information/` for an equivalent document before proceeding.
2. The agent MUST NOT start implementing a phase whose dependencies (as listed in `implementation_plan.md`) are not yet complete.
3. When updating task progress, the agent MUST mark completed items in `Docs/plan/task.md` using `[x]`.
4. `Docs/plan/` documents are **planning artifacts**, not normative spec. In case of conflict with the files in Section 3 (Source-of-Truth Precedence), the normative spec files always win.
