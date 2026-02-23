# ADR-001: Workflow Orchestration Engine Selection

Document ID: `IAMA-ADR-001`
Status: `Decided`
Date: 2026-02-22
Deciders: Backend Architecture Lead, Engineering Lead
Relates to: `V1-FR-JOB-003`, `V1-FR-JOB-007`, `V1-FR-TEST-003`, `V1-FR-ROUTE-003`, Section 6.2 Component 6

---

## Context

IAMA's refactoring workflow is long-running, stateful, and multi-phase. A single job passes through:

```
PENDING -> ANALYZING -> WAITING_STRATEGY -> WAITING_SPEC_APPROVAL
       -> GENERATING_TESTS -> BASELINE_VALIDATION -> REFACTORING
       -> SELF_HEALING (up to 10 iterations) -> DELIVERED / FALLBACK_REQUIRED / FAILED
```

Key behavioral requirements that drive this decision:

1. **State durability across restarts** (V1-FR-JOB-003): Workflow must survive service restarts without drift or loss.
2. **Heartbeat and orphan detection** (V1-FR-JOB-007): IDE-attached jobs must emit heartbeats; cloud token generation must pause within `<= 10s` after heartbeat loss; `300s` grace window with deterministic terminal transition.
3. **Self-healing retry budget enforcement** (V1-FR-TEST-003): Retry count must be tracked across process boundaries, never exceeding 10 iterations.
4. **Three-phase model waterfall** (V1-FR-ROUTE-003): Phase transitions require conditional escalation with confirmation timeout (`3600s`), which may span multiple clock hours.
5. **Backward transitions** (Section 13, State Machine): `BASELINE_VALIDATION_FAILED` and `FALLBACK_REQUIRED` can transition back to `WAITING_SPEC_APPROVAL` within the same job ID; these reentrant transitions must be deterministic.
6. **Quota reservation atomicity** (V1-FR-BIL-004): Quota reservation must be committed or released based on terminal state; this must survive mid-workflow crashes.

The wrong choice here is the highest schedule risk in V1. Changing workflow engines mid-flight requires full re-implementation of all activity definitions, retry policies, state machine transitions, and test infrastructure.

---

## Options Evaluated

### Option A: Temporal.io (Selected)

Temporal is an open-source durable execution platform. Workflows are expressed as code (Python/TypeScript), and the Temporal server persists every event in an append-only history log. Activities can be retried, timed out, and heartbeated independently.

**Capabilities matched to IAMA requirements:**

| IAMA Requirement | Temporal Feature |
|---|---|
| State durability across restarts | Workflow history is append-only; replay is automatic |
| Heartbeat per activity | `activity.heartbeat()` with configurable timeout |
| Retry budget per activity | `RetryPolicy` with `max_attempts`, backoff, non-retryable errors |
| Long-running confirmation timeout (3600s) | `workflow.wait_condition()` with timeout; signal-based approval |
| Reentrant state transitions | `ContinueAsNew` or signal-based sub-workflow |
| Quota reservation atomicity | Compensating sagas via Temporal's saga pattern |
| Multiple language SDKs | Python SDK (backend) and TypeScript SDK (future tooling) |
| Self-hosted or managed (Temporal Cloud) | Self-hosted Temporal Server or Temporal Cloud SaaS |

**Verdict:** All six blocking requirements have direct Temporal primitives. No custom engine code required for state persistence, retry control, or heartbeat management.

### Option B: Inngest

Inngest is an event-driven durable function platform. Functions are serverless-style; events trigger function runs; retry policies are configurable via YAML.

**Assessment:**

| IAMA Requirement | Inngest Gap |
|---|---|
| Long-running (hours) escalation hold | Inngest step timeout limits are stricter; hours-long holds require external state workarounds |
| Reentrant workflow within same job_id | Inngest fan-in across event chains is indirect; same-ID reentry requires custom orchestration |
| Activity-level heartbeat timeout | No native per-activity heartbeat primitive comparable to Temporal's |
| Saga/compensation atomicity | Requires custom event-chain design |
| Self-hosted parity | Inngest self-hosted is less mature than Temporal's self-hosted server |

Inngest is appropriate for simpler event-driven pipelines. IAMA's state machine complexity and long-hold requirements exceed Inngest's natural fit.

### Option C: Custom Workflow Engine

Build an in-house state machine on top of PostgreSQL (job state + event log), message queue (Redis/SQS), and background workers.

**Assessment:**

- Estimated engineering cost: 6-10 weeks minimum before first usable primitive.
- Missing: durable replay, distributed retry semantics, heartbeat primitives, compensation patterns.
- Every requirement that Temporal gives for free must be designed, implemented, tested, and operated.
- High operational risk: custom engines accumulate state bugs silently under load.

**This option is explicitly rejected.** The PRD flags custom-building as the highest schedule risk in V1.

---

## Decision

**DECIDED: Temporal.io**

**Deployment path:**

- **V1**: Self-hosted Temporal Server via Docker Compose, co-deployed with backend services. PostgreSQL as Temporal persistence store (reuses existing DB cluster).
- **V1 Production**: Evaluate Temporal Cloud for managed server operations vs continued self-host, based on operational overhead assessment before V1 GA.
- **V2**: Temporal continues as orchestration backbone for cross-surface workflows, remote execution queue, and IDE/web disconnect handling.

**SDK selection:**

- Primary: Temporal Python SDK for backend (`temporalio` package).
- Worker: Dedicated `run_worker.py` process (already stubbed in monorepo); refactor to full Temporal worker registration.

**Workflow-to-service mapping:**

```
RefactorWorkflow (main)
  ├── AnalyzeContextActivity      -> context builder service
  ├── GenerateProposalsActivity   -> LLM proxy (proposal_schema)
  ├── WaitStrategySignal          -> workflow.wait_condition()
  ├── ExtractSpecActivity         -> LLM proxy (bdd_schema, sdd_schema)
  ├── WaitSpecApprovalSignal      -> workflow.wait_condition()
  ├── GenerateTestsActivity       -> LLM proxy (test_plan_schema)
  ├── BaselineValidationActivity  -> sandbox runner
  ├── RefactorLoopActivity        -> LLM proxy (patch_plan_schema) + sandbox
  │     └── SelfHealingActivity   -> retry budget enforced via RetryPolicy
  ├── WaitEscalationSignal        -> workflow.wait_condition(timeout=3600s)
  ├── RecoveryActivity            -> workspace restore + artifact packaging
  └── HeartbeatActivity           -> activity.heartbeat() + orphan detection
```

---

## Consequences

**Positive:**
- All state machine requirements satisfied via Temporal primitives without custom code.
- Retry budget, heartbeat, and escalation hold are declarative — no manual tracking in application logic.
- Temporal UI (tctl / web) provides workflow inspection for operational debugging.
- SDK supports async Python natively.

**Negative / Risks:**
- Temporal Server adds infrastructure dependency (mitigated: Docker Compose deployment in V1, Temporal Cloud option for V1 prod).
- Temporal history replay has size limits for very long-running workflows (mitigated: `ContinueAsNew` at natural phase boundaries).
- Team must learn Temporal programming model (activity vs workflow boundary, determinism constraints in workflow code).

**Migration cost if wrong:** Rewriting all activities, retry policies, and state machine tests — estimated 3-5 weeks. This is why this decision must precede backend scaffolding.

---

## Action Items

1. Add `temporalio` to `requirements.txt`.
2. Refactor `run_worker.py` to register Temporal workers and activity functions.
3. Refactor `workflows/refactor_workflow.py` to Temporal Workflow class model.
4. Refactor `workflows/activities.py` to Temporal Activity functions with heartbeat calls.
5. Add Temporal Server to `docker-compose.yml` (official `temporalio/server` image).
6. Define signal names and payload schemas for `WaitStrategySignal`, `WaitSpecApprovalSignal`, `WaitEscalationSignal`.
7. Implement `HeartbeatActivity` with `activity.heartbeat()` tied to cloud token generation pause logic.
8. Validate Temporal persistence on PostgreSQL using existing DB cluster.
