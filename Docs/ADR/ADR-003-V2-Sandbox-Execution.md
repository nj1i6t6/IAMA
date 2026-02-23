# ADR-003: V2 Server-Side Sandbox Execution Architecture

Document ID: `IAMA-ADR-003`
Status: `Decided`
Date: 2026-02-22
Deciders: Backend Architecture Lead, Security Lead, Engineering Lead
Relates to: `V2-FR-RUN-001` through `V2-FR-RUN-010`, `V2-FR-RUN-004` (microVM requirement), Section 6.2 V2 Components

---

## Context

V2 introduces server-side sandbox execution for paid tiers. This is fundamentally different from V1's local execution model:

- Code runs in IAMA's cloud infrastructure, not on the user's machine.
- Source code is transferred to a remote workspace and executed there.
- Security boundary must be hardware-isolation-class.
- Network egress must be phased: allowlist during build/sync, deny-by-default during test/execution.
- Ephemeral lifecycle: every run gets a clean workspace; all writable data is securely wiped after terminal state.
- Dependency caching must be cross-job but strictly isolated by org and repo scope.

**Key requirements that drive this decision:**

1. **Hardware-isolation-class microVM** (V2-FR-RUN-004): Not shared generic containers. V2.0 may use hardened gVisor as interim; V2.x enterprise GA requires hardware-isolation-class (Firecracker or equivalent).
2. **Phased network policy** (V2-FR-RUN-005): Build stage allows approved egress; test/execution stage is deny-by-default.
3. **Secure wipe verification** (V2-FR-RUN-007): Terminal state requires confirmed wipe evidence before completion.
4. **Dependency cache with CoW isolation** (V2-FR-RUN-008): Read-only base cache + per-job copy-on-write layer, strictly isolated by org/repo scope.
5. **Ephemeral service containers** (V2-FR-RUN-008): Legacy tests requiring PostgreSQL or Redis must use ephemeral containers within the same isolated boundary.
6. **Execution timeout by language profile** (V2-FR-RUN-006): Dynamic timeout config per language, managed via DynamicConfig (V1-FR-OPS-001).

This decision affects V2 only. V1 uses local Docker and local native execution (no server-side sandbox). However, the V1 backend architecture must not preclude the V2 sandbox integration path described here.

---

## V1 Compatibility Constraint

V1 backend architecture must satisfy the following compatibility pre-conditions for V2 sandbox integration:

1. Temporal workflow engine (ADR-001) can dispatch remote execution activities to a separate worker pool — no architectural change required when sandbox workers are added in V2.
2. Job model includes `execution_mode` field (`LOCAL_DOCKER`, `LOCAL_NATIVE`, `REMOTE_SANDBOX`) — add as V1 migration with `LOCAL_DOCKER` default.
3. Heartbeat and orphan handling (V1-FR-JOB-007) already distinguishes mode-aware behavior: remote execution continues on disconnect, local execution pauses. State machine must treat these as distinct paths.
4. Artifact retrieval by `job_id` (V1-FR-BIL-006) is compatible with remote artifact sync (V2-FR-WEB-006).

---

## Options Evaluated

### Option A: E2B (V2.0) + Self-Hosted Firecracker (V2.x Enterprise) — Selected

**E2B** is an open-source AI-native sandbox platform. It provides:
- Isolated sandbox environments with ephemeral lifecycle.
- Network isolation with configurable egress.
- Python and TypeScript SDKs for sandbox lifecycle management.
- Filesystem control and process execution APIs.
- Self-hostable (E2B self-hosted on AWS/GCP using Firecracker or gVisor kernel).

**Deployment strategy:**

| Phase | Sandbox Stack | Target |
|---|---|---|
| V2.0 Early Access | E2B self-hosted with hardened gVisor isolation | Individual paid users, beta |
| V2.0 GA | E2B self-hosted with hardened gVisor + security attestation | Individual paid, small teams |
| V2.x Enterprise GA | E2B self-hosted on Firecracker microVM kernel | Enterprise, compliance-ready |

**Why E2B for V2.0:**
- Purpose-built for AI-assisted code execution — lifecycle, egress control, and ephemeral semantics align with IAMA's use case without custom infrastructure.
- Open-source and self-hostable: no vendor lock-in.
- E2B SDK abstracts sandbox provisioning; IAMA sandbox pool manager calls the SDK.
- Secure wipe: E2B sandbox destruction API with verified cleanup; IAMA records wipe evidence.
- gVisor (runsc) provides kernel-level isolation sufficient for V2.0 non-enterprise tier.
- Migration path to Firecracker: E2B self-hosted supports Firecracker as the kernel runtime — upgrade is a deployment config change, not an application code change.

**V2-FR-RUN-004 compliance path:**
- V2.0: gVisor isolation used as documented interim. Enterprise disclosure must state "hardware-isolation-class microVM (Firecracker) is in roadmap; current isolation uses gVisor kernel".
- V2.x: Switch E2B self-hosted runtime from gVisor to Firecracker. No application code change. Security attestation rerun confirms hardware-isolation-class compliance.

### Option B: Modal

Modal is a managed cloud compute platform for Python workloads.

**Assessment:**

| IAMA Requirement | Modal Gap |
|---|---|
| Self-hostable | Modal is fully managed SaaS — no self-hosted path |
| Phased network policy (build allow / test deny) | Network policy control is limited in Modal's current offering |
| Custom secure wipe evidence | Modal handles cleanup internally; no verifiable wipe evidence API |
| Ephemeral service containers (Postgres/Redis) | Not natively supported; requires workaround |
| Dependency cache with CoW isolation per org/repo | Modal's caching is function-scoped, not org/repo-scoped isolation |

Modal is strong for ML inference and GPU workloads. IAMA's requirements for phased network policy, verifiable secure wipe, and self-hosted compliance make Modal a poor fit.

### Option C: Daytona

Daytona is a developer-focused sandboxed execution environment platform.

**Assessment:**

| IAMA Requirement | Daytona Gap |
|---|---|
| Batch execution (non-interactive) | Daytona is designed for interactive developer workspaces, not batch job execution |
| Phased network policy (deny-by-default in test stage) | Developer workspace model defaults to full network access |
| Ephemeral lifecycle with secure wipe | Daytona environments are persistent developer workspaces by design |
| Hardware-isolation-class microVM | Not a primary Daytona design goal |

Daytona is not suited for IAMA's automated batch execution model.

### Option D: Fully Custom MicroVM Infrastructure (Firecracker from Day One)

Build and operate a Firecracker-based microVM pool directly on IAMA infrastructure from V2.0.

**Assessment:**

- Engineering cost: 16-24 weeks minimum for production-grade pool management, network policy enforcement, secure wipe, and dependency cache layer.
- Requires specialized kernel/systems engineering.
- Operational risk: cold path infrastructure with no proven track record in IAMA team's experience profile.
- No business justification for V2.0 timeline.

**Rejected for V2.0.** Firecracker is the V2.x upgrade target via E2B self-hosted runtime swap.

---

## Decision

**DECIDED: E2B self-hosted (gVisor interim for V2.0, Firecracker for V2.x enterprise GA)**

**V2.0 deployment:**

```
IAMA Control Plane (Temporal + Backend)
        |
        v
[Sandbox Pool Manager] -- E2B self-hosted API
        |
   +---------+
   | Sandbox |  <-- E2B managed ephemeral VM
   |  gVisor |  <-- kernel isolation
   |---------|
   | Build   |  <-- egress: approved package mirrors only
   | Stage   |
   |---------|
   | Test    |  <-- egress: deny-by-default
   | Stage   |      (mocked external calls)
   |---------|
   | Wipe    |  <-- verifiable cleanup event
   +---------+
```

**Dependency cache architecture:**

```
Read-Only Base Cache (org_id + repo_id scoped)
        |
        v
Per-Job CoW Layer (copy-on-write, isolated)
        |
  [Job runs in CoW layer]
        |
  [Job terminal state: CoW layer wiped]
  [Base cache preserved for next job]
```

**Ephemeral service containers:**
- Testcontainers-compatible pattern using container images sourced from approved build-stage egress allowlist.
- PostgreSQL, Redis, etc. run within same isolated microVM boundary.
- Containers do not persist data beyond job terminal state.

**Network policy implementation:**

| Stage | Policy | Enforcement |
|---|---|---|
| Dependency build/sync | Allowlist egress (approved package mirrors) | E2B network namespace + iptables rules |
| Test/execution (default) | Deny-by-default | E2B network namespace full block |
| Test/execution (enterprise FQDN allowlist) | Explicit FQDN whitelist per approved org policy | IntegrationEgressPolicySnapshot per run |

**Secure wipe evidence:**
- E2B sandbox destruction API called at job terminal state.
- IAMA records `SecureWipeEvidence` entity with: sandbox_id, terminal_state, wipe_timestamp, wipe_status.
- Terminal state transition is blocked until wipe evidence is recorded (`REMOTE_WIPE_VERIFYING` state).

---

## Consequences

**Positive:**
- E2B provides lifecycle management, network isolation, and ephemeral semantics — IAMA only implements policy enforcement and evidence recording on top.
- Firecracker upgrade path is a deployment config change only — no application migration needed.
- Self-hosted E2B eliminates vendor lock-in and allows air-gap deployment for enterprise.

**Negative / Risks:**
- E2B self-hosted operational complexity: requires Kubernetes or equivalent orchestration for pool management.
- gVisor isolation is not hardware-isolated — enterprise disclosure is mandatory for V2.0.
- V2.x Firecracker upgrade requires operational testing and security re-attestation before enterprise GA.

**V1 backend changes required now:**
- Add `execution_mode` field to `RefactorJob` model (V1 migration, default `LOCAL_DOCKER`).
- Document sandbox pool manager interface in V2 design documents before V1 backend scaffolding is finalized.
- Temporal activity dispatch model supports remote sandbox worker addition in V2 without refactoring V1 activities.

---

## Action Items (V2 Milestone)

1. Evaluate E2B self-hosted deployment on GCP/AWS; confirm gVisor runtime availability.
2. Design `SandboxPoolManager` service interface (provision, heartbeat, terminate, wipe-verify).
3. Define `RemoteExecutionSession` entity schema including wipe evidence fields.
4. Implement phased network policy configuration in E2B sandbox lifecycle.
5. Design dependency cache index schema with org/repo scope isolation.
6. Prototype Testcontainers-compatible ephemeral service container support within E2B boundary.
7. Draft V2.x enterprise security attestation checklist for Firecracker upgrade.
8. Add `execution_mode` column to `RefactorJob` model in V1 via migration.
