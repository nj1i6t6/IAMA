# IAMA Development Workflow (Agent-Oriented)

Document ID: `IAMA-DEV-WORKFLOW-001`  
Version: `2.0`  
Status: `Authoritative`  
Last Updated: `2026-02-22`  
Audience: Engineers and LLM agents implementing IAMA

---

## 1. Purpose
This document defines the end-to-end development workflow for IAMA.

It exists to ensure:
1. No requirement drift.
2. No hallucinated API/schema/workflow behavior.
3. Deterministic delivery across V1 and V2.
4. Full traceability from requirement to shipped behavior.

## 2. Scope
This workflow applies to:
1. V1 implementation work.
2. V2 expansion work.
3. Feature development, bug fixes, refactors, and operational changes.

## 3. Normative Language
Keywords used in this document:
1. `MUST`: mandatory.
2. `SHOULD`: strongly recommended.
3. `MAY`: optional.

## 4. Source Documents and Precedence
All development decisions MUST follow this precedence:
1. `Docs/IAMA_PRODUCT_REQUIREMENTS_V1_EN.md`
2. `Docs/IAMA_PRODUCT_REQUIREMENTS_V2_EN.md`
3. `Docs/ADR/ADR-001-Workflow-Engine.md`
4. `Docs/ADR/ADR-002-LLM-Proxy.md`
5. `Docs/ADR/ADR-003-V2-Sandbox-Execution.md`
6. `Docs/DEV/API_CONTRACT.md`
7. `Docs/DEV/DB_SCHEMA.md`
8. `Docs/DEV/SERVICE_ARCHITECTURE.md`
9. `Docs/DEV/AGENT_DEVELOPMENT_GUIDE.md`
10. `Docs/UX/UX-DESIGN-SYSTEM.md`
11. `Docs/UX/UX-WIREFRAME-IDE.md`
12. `Docs/UX/UX-WIREFRAME-WEB.md`

If documents conflict and precedence does not fully resolve it, implementation MUST stop and escalate.

## 5. Workflow Execution Model
IAMA development uses a `spec-driven vertical-slice` model.

For each slice, the team/agent MUST:
1. Map changes to requirement IDs.
2. Validate API and DB contract alignment.
3. Implement the smallest end-to-end behavior that is testable.
4. Include failure-path behavior, not only happy-path behavior.
5. Produce evidence (tests + docs + auditability).

---

## 6. End-to-End Phases

### 6.1 Phase 0 - Intake and Classification
Objective:
1. Convert incoming requests into bounded implementation tasks.

Required inputs:
1. Request or incident statement.
2. Relevant PRD requirement IDs.
3. Current service and data boundaries.

Required actions:
1. Classify scope as `V1 only`, `V2 only`, or `V1+V2 shared`.
2. Classify risk as `P0`, `P1`, or `P2`.
3. Identify impacted domains:
   - API
   - DB
   - workflow state machine
   - billing/quota
   - security/compliance
   - UX

Required outputs:
1. Task record with requirement IDs.
2. Initial risk statement.

Exit criteria:
1. Task has requirement mapping.
2. Task scope is bounded and implementable.

### 6.2 Phase 1 - Requirement Decomposition and Traceability
Objective:
1. Build a deterministic requirement-to-implementation map.

Required actions:
1. Create a Requirement Trace Matrix with:
   - requirement ID
   - API endpoint(s)
   - DB entities
   - workflow transitions
   - test coverage reference
   - security/compliance checks
2. Validate each requirement against:
   - `API_CONTRACT`
   - `DB_SCHEMA`
   - ADR constraints
3. Add unresolved conflicts to a Spec Conflict Log.

Exit criteria:
1. Every implementation item has requirement coverage.
2. No orphan implementation items remain.

### 6.3 Phase 2 - Contract and Design Freeze
Objective:
1. Freeze implementation boundaries before code changes.

Required actions:
1. Freeze API request/response shapes.
2. Freeze error and denial reason behavior.
3. Freeze DB migration plan (forward-only).
4. Freeze workflow transition rules.
5. Freeze ownership/entitlement/quota enforcement points.
6. Document failure and recovery paths.

Required outputs:
1. Implementation design note.
2. API/DB/workflow delta list.

Exit criteria:
1. No unresolved architectural blockers.
2. All required interfaces are explicit.

### 6.4 Phase 3 - Sprint 0 PoC Validation
Objective:
1. De-risk high-uncertainty technical areas before core delivery.

Mandatory PoCs (from V1 PRD Section 20):
1. Dual-language schema sync (Node API and Python Temporal worker).
2. `patch_edit_schema` apply reliability.

Conditional PoCs:
1. Cross-ecosystem Black-Box orchestration (V1.x scope).
2. E2B snapshot/CoW path (V2 scope).

Required outputs:
1. PoC test report with pass/fail criteria.
2. Risk and mitigation plan.

Exit criteria:
1. Mandatory PoCs passed, or
2. Requirement scope was formally adjusted based on PoC outcomes.

### 6.5 Phase 4 - Platform Foundations
Objective:
1. Build reusable foundations that all feature slices depend on.

Foundation modules:
1. Auth and token lifecycle.
2. Entitlement and quota reservation service.
3. Temporal workflow scaffolding.
4. LiteLLM routing integration.
5. Audit events and telemetry guards.
6. Dynamic config and operator controls.

Exit criteria:
1. Foundations are runnable and testable.
2. Cross-cutting controls are in place.

### 6.6 Phase 5 - V1 Delivery Waves
Recommended order:
1. Auth, subscription, usage.
2. Job lifecycle endpoints and ownership enforcement.
3. Proposal and spec lifecycle (BDD/SDD + revision tokens).
4. Test generation and baseline validation gate.
5. Refactor loop, self-healing, intervention/deep-fix.
6. Delivery, apply, revert, fallback evidence.
7. Billing webhooks, support, admin, telemetry controls.

Each wave MUST include:
1. Requirement mapping.
2. API + DB + workflow conformance check.
3. Tests for both success and failure behavior.
4. Security checks.

### 6.7 Phase 6 - V2 Delivery Waves
Recommended order:
1. GitHub OAuth/repository preflight/head checks.
2. Web workspace and cross-surface spec synchronization.
3. Remote sandbox lifecycle and wipe verification.
4. Web delivery to branch/commit/PR and rebase path.
5. Sync Remote Job and local conflict handling.
6. Team/org governance and billing subject rules.
7. Compliance APIs and enterprise telemetry controls.

V2 non-negotiables:
1. Free/Plus MUST be blocked from cloud-gated actions.
2. Remote terminal states MUST require wipe verification evidence.
3. Out-of-band GitHub revocation MUST invalidate access immediately.
4. Sync apply conflicts MUST block unsafe writes.

### 6.8 Phase 7 - Quality and Test Gates
Required test layers:
1. Unit tests for deterministic business logic.
2. Integration tests for API + DB + workflow behavior.
3. Contract tests for external integrations.
4. End-to-end tests for critical user journeys.

Mandatory test domains:
1. Ownership isolation.
2. Quota race/double-spend prevention.
3. Spec revision conflicts.
4. Baseline gate and retry/intervention rules.
5. Disconnect and heartbeat behavior.
6. Billing checkpoint behavior.
7. Metadata-only telemetry behavior.

Exit criteria:
1. All required tests pass.
2. No open P0 defects.

### 6.9 Phase 8 - Security and Compliance Gates
Required checks:
1. Auth before business logic.
2. Ownership and org-scope authorization.
3. Secret redaction and no secret logging.
4. Encryption and retention policy compliance.
5. Metadata-only support payload defaults.
6. Enterprise zero-telemetry policy handling.

V2 additional checks:
1. Network egress policy enforcement by execution stage.
2. Verified secure wipe evidence before completion.
3. Cache isolation by org/repo scope.

Exit criteria:
1. Security checklist complete.
2. Compliance evidence available for audit.

### 6.10 Phase 9 - Release and Migration
Required actions:
1. Verify release gates from PRD acceptance sections.
2. Validate migration safety and backward compatibility.
3. Use staged rollout and feature flags.
4. Ensure kill-switch readiness for incident response.

Post-release checks:
1. API error budget and latency.
2. Workflow state drift.
3. Quota and billing reconciliation.
4. Remote wipe and revocation SLA (V2).

### 6.11 Phase 10 - Operations and Feedback Loop
Required observability:
1. State transition metrics.
2. Quota reservation metrics.
3. LLM latency and token metrics.
4. API latency and error metrics.
5. Sandbox lifecycle metrics (V2).

Required actions:
1. Link incidents to requirement IDs.
2. Classify root cause as spec gap, code defect, or ops issue.
3. Update specs/contracts/docs when the root cause is specification drift.

---

## 7. Cross-Cutting Controls (Always-On)

### 7.1 Requirement Traceability
Every change MUST be linked to requirement IDs and acceptance criteria.

### 7.2 Contract Safety
No implementation MAY bypass `API_CONTRACT` or `DB_SCHEMA` boundaries.

### 7.3 State-Machine Integrity
State transitions MUST match PRD definitions and illegal transitions MUST be blocked.

### 7.4 Entitlement and Quota Integrity
Quota reservation MUST be atomic and race-safe before execution starts.

### 7.5 Privacy and Data Minimization
Telemetry and support payloads MUST follow metadata-only defaults where required.

### 7.6 Documentation Synchronization
When behavior changes, affected documents MUST be updated in the same delivery cycle.

---

## 8. Mandatory Stop Conditions
Implementation MUST stop and escalate if:
1. A required behavior has no normative specification.
2. An implementation requires new public API or DB entities not in contract/schema.
3. An ADR-mandated technology would need to be replaced.
4. Conflicting authoritative requirements cannot be resolved deterministically.

Escalation output MUST include:
1. Exact file and section references.
2. Candidate implementation options.
3. Recommended option with risk and tradeoff.

---

## 9. Delivery Artifacts (Minimum)
Each completed slice MUST produce:
1. Requirement Trace Matrix entry updates.
2. Code and migration changes (if needed).
3. Test evidence.
4. Updated documentation.
5. Operational notes for rollout and monitoring (if behavior changed).

---

## 10. Checklists

### 10.1 Pre-Implementation Checklist
1. Requirement IDs identified.
2. API deltas validated.
3. DB deltas validated.
4. Workflow transitions validated.
5. Security and billing impact assessed.

### 10.2 Pre-Merge Checklist
1. No undefined endpoint/table/column introduced.
2. Tests include at least one failure-path scenario.
3. Machine-readable error/denial behavior implemented where required.
4. Documentation updated.

### 10.3 Pre-Release Checklist
1. PRD acceptance criteria met for affected scope.
2. Security and compliance checks passed.
3. Rollout and rollback controls validated.
4. Monitoring and alerts configured for changed behavior.

---

## 11. Definitions

### 11.1 Definition of Ready
A task is Ready only if:
1. Requirement mapping exists.
2. Scope and risk are defined.
3. API/DB/workflow impacts are known.
4. No unresolved high-severity spec conflict exists.

### 11.2 Definition of Done
A task is Done only if:
1. Implementation aligns with requirements, API contract, DB schema, and state machine.
2. Test evidence demonstrates acceptance behavior.
3. Documentation is updated and traceable.
4. No unresolved assumptions remain.

