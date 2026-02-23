# IAMA Product Requirements - V2 (English)

Document ID: `IAMA-PRD-V2-EN`  
Version: `1.0`  
Status: `Approved for Build`  
Audience: Product, Design, Backend, Frontend, Extension, QA, AI Agent Developers

## 1. Purpose
This document defines V2 requirements as an expansion of V1 into a dual-surface product:
1. IDE-first refactoring continues.
2. Web-first GitHub refactoring is added for paid users.
3. Server-side sandbox execution is introduced with enterprise-grade controls.

This is a requirements specification only.  
Do not treat this as implementation pseudocode.

## 2. V2 Positioning
V2 positions IAMA as a full product platform:
1. VS Code experience for developer-centric flow.
2. Web workspace for remote refactoring orchestration.
3. Unified cloud governance across both surfaces.

Primary value in V2:
1. Cross-surface continuity.
2. Secure managed execution at scale.
3. Monetizable premium capabilities.
4. Enterprise-grade security and compliance for remote execution.

V2 planning boundary:
1. V1 foundations (payment webhooks, operator controls, support reporting, telemetry) remain required and must stay backward compatible.
2. V2 extends those foundations for remote compute, GitHub-native workflows, and enterprise governance.

## 3. Goals
### 3.1 Product goals
1. Add web-native refactor flow from GitHub repositories.
2. Support server-side sandbox execution for premium tiers.
3. Preserve low-regression principles with BDD/SDD/TDD safeguards.
4. Keep UX non-generic and non-chatbot-centric.

### 3.2 Business goals
1. Increase conversion from free to paid through premium execution features.
2. Increase enterprise readiness with governance and policy controls.
3. Enable team collaboration workflows and auditable operations.

### 3.3 Success metrics
1. Paid feature adoption rate for remote execution: `>= 35%` of paid active users.
2. End-to-end web refactor completion rate: `>= 60%`.
3. Enterprise policy compliance pass rate: `>= 98%`.
4. Cross-surface handoff success (web to IDE or IDE to web): `>= 95%`.

## 4. Scope
### 4.1 In scope for V2
1. Web-based GitHub repository connect/import.
2. Web-based job creation and monitoring.
3. Server-side sandbox execution for paid tiers only.
4. Unified entitlement control across IDE and web.
5. Team collaboration foundations (projects, members, roles, audit visibility).
6. Enhanced usage and billing transparency including premium usage dimensions.
7. Cross-surface real-time job state synchronization with race-condition control.
8. Remote execution hardening with hardware-isolation-class sandboxing, secure wipe, and egress restrictions.
9. Remote repository intake guardrails (size/file limits and mandatory path scope).
10. Compliance operations: right-to-be-forgotten and enterprise audit export.

### 4.2 Out of scope for V2
1. Full real-time multi-user collaborative editor.
2. On-prem self-hosting package.
3. Marketplace of third-party execution providers.
4. Remote or customer-managed execution target integration (for example mainframe-hosted COBOL or RPG).

## 5. User and Tier Model
### 5.1 User segments retained
1. Segment A (guided non-technical).
2. Segment B (technical).
3. Segment C (enterprise governance).

### 5.2 Tiered entitlements
1. Free tier:
   1. IDE refactor flow only (local execution).
   2. No web GitHub refactor or server-side sandbox execution.
   3. Simple Mode only; Phase 1 gated at 3 jobs/day.
2. Plus tier:
   1. IDE refactor flow only (local execution).
   2. No web GitHub refactor or server-side sandbox execution.
   3. Simple Mode only; Phase 1 high quota + Phase 2 unlocked (10 runs/month).
3. Pro / Max tiers (cloud-enabled individual):
   1. IDE + web GitHub refactor flow.
   2. Server-side sandbox execution quotas (Pro: 50 Phase 2 runs/month; Max: 200 Phase 2 + 20 Phase 3 runs/month).
   3. Professional Mode; 200K context (Pro and Max). Note: Max context is 200K, not 500K — only Enterprise gets 1M.
4. Enterprise tier:
   1. All Pro/Max capabilities plus Enterprise Mode.
   2. Dedicated governance controls.
   3. Advanced audit and policy configuration.
   4. Unlimited execution across all phases; 1M context.
   5. Enterprise Analysis Report generation.
   6. Higher concurrency and support options.

## 6. Architecture Expansion
### 6.1 Control and execution planes
1. Cloud control plane remains mandatory for identity, billing, usage, governance, and LLM proxy.
2. Two execution options:
   1. IDE local sandbox execution.
   2. Cloud server sandbox execution.

### 6.2 New V2 components
1. GitHub integration service (OAuth app + repository permissions).
2. Remote workspace manager.
3. Server sandbox pool manager.
4. Entitlement policy engine.
5. Team/project role service.
6. Cross-surface state sync gateway (Server-Sent Events (SSE) and revision locking).
7. Remote execution security controller (phased network policy and secure wipe verification).
8. Remote repository preflight service (size/file/path scope checks).
9. Compliance service (data erasure workflow and audit export jobs).
10. Client presence/heartbeat monitor for mode-aware orphan handling.
11. Remote artifact sync bridge for web-to-IDE diff handoff.
12. GitHub revocation event handler for out-of-band authorization invalidation.
13. Context filter guard for binary/compiled/minified pre-AST blocking.
14. Head-drift rebase and validation orchestrator.
15. Sync conflict assist engine for remote-to-local apply resolution.

## 7. End-to-End Flows
### 7.1 Web-first paid flow
1. Paid user logs into web portal.
2. Connects GitHub account and selects repository/branch.
3. Creates refactor job with strategy preferences.
4. Reviews and edits BDD/SDD in natural language.
5. Starts managed server sandbox execution.
6. Monitors logs and attempts in web workspace.
7. Reviews diff artifact and delivers via standard web options: create branch + open pull request, with patch export as fallback.
8. If direct PR delivery is unavailable, user can use IDE `Sync Remote Job` to review/apply the same artifact in native IDE diff flow.

### 7.2 IDE-first flow with premium escalation
1. User starts in VS Code as in V1.
2. If local resources are limited, user can escalate job to server sandbox (paid entitlement required).
3. Job continues under same workflow id and audit lineage.
4. If IDE disconnects during remote execution, run continues and result is delivered to web workspace and IDE sync entrypoints when client reconnects.

### 7.3 Free / Plus guardrail flow
1. Free or Plus user attempts a cloud-gated action (web GitHub refactor or server sandbox execution).
2. System blocks action with an entitlement message and the appropriate upgrade path.
3. Existing non-premium IDE local flow remains fully usable.
4. Historical web jobs, logs, and artifacts from prior higher-tier periods remain accessible in read-only mode (subject to TTL policy).

## 8. Functional Requirements
### 8.1 Entitlement and Access Control
1. `V2-FR-ENT-001`
Requirement: Cloud-gated premium features (web GitHub refactor flow and server-side sandbox execution) must be entitlement-gated to Pro tier and above.
Priority: P0
Acceptance: Free and Plus users cannot start web GitHub refactor or server sandbox jobs. Any API call carrying a Free or Plus entitlement token for these surfaces must be rejected with HTTP 403 and an `ENTITLEMENT_INSUFFICIENT` error code.

2. `V2-FR-ENT-002`  
Requirement: Entitlement checks must be enforced server-side for all premium APIs.  
Priority: P0  
Acceptance: Client spoofing cannot bypass premium restrictions.

3. `V2-FR-ENT-003`  
Requirement: Extension and web UI must display capability state from entitlement API.  
Priority: P1  
Acceptance: UI controls reflect allowed/blocked feature set per user.

4. `V2-FR-ENT-004`  
Requirement: Free-tier users must be blocked from starting new web/remote jobs but must retain read-only access to historical web jobs/logs/artifacts produced during prior active subscriptions, subject to retention policy.  
Priority: P0  
Acceptance: Downgraded users can view historical results but cannot trigger new premium executions.

### 8.2 GitHub Integration
1. `V2-FR-GH-001`  
Requirement: Users can connect GitHub account via OAuth and select repositories.  
Priority: P0  
Acceptance: Connected account can list authorized repos under scope policy.

2. `V2-FR-GH-002`  
Requirement: Repo import must support branch and path targeting.  
Priority: P0  
Acceptance: Job setup can specify branch and subdirectory scope.

3. `V2-FR-GH-003`  
Requirement: Access token and repository permission usage must be auditable.  
Priority: P0  
Acceptance: Audit records include actor, repo, scope, and timestamp.

4. `V2-FR-GH-004`  
Requirement: GitHub App/OAuth scopes must follow least privilege and must not request unrelated org-admin permissions.  
Priority: P0  
Acceptance: Scope review checklist and runtime policy checks enforce repo-level minimum scope.

5. `V2-FR-GH-005`  
Requirement: Before delivery, system must revalidate remote branch Head SHA against the job-start snapshot.  
Priority: P0  
Acceptance: If Head SHA changed, workflow enters controlled conflict handling with revalidation branch and machine-readable recovery options.

6. `V2-FR-GH-006`  
Requirement: Repo import must enforce hard limits for repository size and file count, and require explicit path scope before analysis.  
Priority: P0  
Acceptance: Oversized or unscoped imports are rejected before parsing or sandbox scheduling.

7. `V2-FR-GH-007`  
Requirement: Users and org admins must be able to revoke GitHub OAuth/App integration from web portal controls; revocation must immediately terminate active syncing and trigger token destruction workflows.  
Priority: P0  
Acceptance: Revoked connections cannot be reused; in-flight sync transitions to controlled failure/cancel state with audit evidence.

8. `V2-FR-GH-008`  
Requirement: GitHub API throttling must be handled with graceful backoff/retry and non-terminal throttled state transitions instead of immediate hard failure when retry budget remains.  
Priority: P0  
Acceptance: Throttled sync attempts transition to `REPO_SYNC_THROTTLED` with retry timing surfaced to UI/audit.

9. `V2-FR-GH-009`  
Requirement: GitHub commits/PRs created by AI workflow must include explicit code provenance markers (`Co-authored-by: IAMA-Agent <bot@iama.dev>`) and PR description references to originating `job_id`.  
Priority: P0  
Acceptance: Delivery artifacts in GitHub are traceable to AI-assisted origin without impersonation ambiguity.

10. `V2-FR-GH-010`  
Requirement: System must ingest and process GitHub App `github_app_authorization` revocation webhooks to enforce immediate token invalidation, active sync termination, and revocation-side data destruction workflows for out-of-band revocations initiated directly in GitHub.  
Priority: P0  
Acceptance: Out-of-band revocations are reflected without user portal action; stale token use is blocked and in-flight sync transitions to controlled cancellation/failure with audit evidence.

11. `V2-FR-GH-011`  
Requirement: When Head SHA drifts before delivery, system must support policy-gated auto-rebase/replay with baseline revalidation before declaring hard conflict failure.  
Priority: P0  
Acceptance: Eligible jobs attempt automated rebase+validation path; only failed or policy-blocked rebase paths end in terminal conflict block.

12. `V2-FR-GH-012`  
Requirement: GitHub commits generated by platform delivery must be cryptographically signed (GitHub App signing identity or managed platform GPG/SSH key) when repository/organization branch protection requires verified signatures.  
Priority: P0  
Acceptance: Delivery flow validates signature compliance before PR finalization; unsigned/unverified paths are blocked with machine-readable policy reason.

### 8.3 Web Refactor Workspace
1. `V2-FR-WEB-001`  
Requirement: Web workspace shall support proposal selection and BDD/SDD natural-language editing.  
Priority: P0  
Acceptance: Web and IDE surfaces follow same spec lifecycle rules.

2. `V2-FR-WEB-002`  
Requirement: Web workspace shall provide live logs, attempt timeline, and delivery diff view.  
Priority: P0  
Acceptance: Users can complete full refactor lifecycle without IDE dependency.

3. `V2-FR-WEB-003`  
Requirement: Web workspace UI must follow anti-generic anti-AI-look design constraints.  
Priority: P0  
Acceptance: Design QA checklist passes all visual and interaction constraints.

4. `V2-FR-WEB-004`  
Requirement: Web delivery must support direct GitHub branch commit and pull request creation as first-class outcome, with patch bundle export as fallback path.  
Priority: P0  
Acceptance: User can complete acceptance-to-PR flow without switching to IDE.

5. `V2-FR-WEB-005`  
Requirement: Web delivery must create pull requests as Draft by default; non-default ready-for-review creation is allowed only when explicitly selected in delivery policy and permitted by organization guardrails.  
Priority: P0  
Acceptance: Default behavior is Draft PR creation; any non-draft creation path is explicit, policy-checked, and audit-logged.

6. `V2-FR-WEB-006`  
Requirement: IDE extension must support `Sync Remote Job` to fetch completed web-initiated job artifacts and review/apply via native IDE diff view, without manual `.patch` shell workflow.  
Priority: P0  
Acceptance: User can select a completed remote job in IDE, open native diff, and apply/reject changes safely.

7. `V2-FR-WEB-007`  
Requirement: During `Sync Remote Job` apply flows, IDE client must perform local workspace base-hash verification and overlap detection; if local uncommitted changes overlap with remote diff targets, apply must be blocked with explicit conflict warning. For Segment A users, prompt must be plain-language (`Your local files have unsaved changes that conflict with this update. Please save or discard your changes before applying.`) and must not expose git terminology.  
Priority: P0  
Acceptance: Overlap conflicts never auto-apply; user receives deterministic conflict details and resolution path before reattempt.

8. `V2-FR-WEB-008`  
Requirement: `Sync Remote Job` conflict handling must provide optional assisted resolution modes (`three_way_merge` or `auto_stash_apply_pop_with_markers`) in addition to hard block guidance. Assisted merge modes are available only to Segment B and Segment C users; Segment A users receive plain-language block-and-resolve guidance without merge primitives exposure.  
Priority: P1  
Acceptance: User can choose assisted merge path, review resulting conflicts, and confirm final apply without silent overwrite.

9. `V2-FR-WEB-009`  
Requirement: Job setup must expose delivery policy selection (`DRAFT_PR` default, `READY_FOR_REVIEW_PR` optional) with organization guardrails.  
Priority: P1  
Acceptance: PR state matches selected policy and policy decision is audit-logged.

### 8.4 Server Sandbox Execution
1. `V2-FR-RUN-001`  
Requirement: Paid users can execute jobs in server-side sandbox pools.  
Priority: P0  
Acceptance: Job execution mode can be selected and is enforced by backend.

2. `V2-FR-RUN-002`  
Requirement: Server sandbox runs shall enforce resource limits, isolation, and ephemeral lifecycle.  
Priority: P0  
Acceptance: Runtime profiles show policy-compliant isolation settings.

3. `V2-FR-RUN-003`  
Requirement: Failure outputs from server sandbox shall feed fallback workflow exactly as in IDE mode.  
Priority: P0  
Acceptance: Fallback evidence parity exists between local and server execution modes.

4. `V2-FR-RUN-004`
Requirement: Remote sandbox isolation must use hardware-isolation-class microVM architecture, not shared generic runtime-only containers.
Priority: P0
Acceptance: Security review and runtime attestation confirm microVM-class execution boundary.
Implementation Path: V2.0 may use hardened gVisor-based container isolation as interim measure, provided security attestation documents are produced and reviewed. V2.x upgrade to hardware-isolation-class microVM (for example Firecracker) is required before enterprise tier GA. Interim gVisor path must be documented as known security-boundary limitation in enterprise disclosures.
> [DECIDED — See ADR-003]
> Sandbox stack: **E2B self-hosted** (gVisor runtime for V2.0, Firecracker for V2.x enterprise GA).
> Decision records, deployment strategy, and V1 compatibility pre-conditions in `Docs/ADR/ADR-003-V2-Sandbox-Execution.md`.
> Modal and Daytona were evaluated and rejected (see ADR-003 for details).
> V1 backend must add `execution_mode` field to RefactorJob model before V1 GA to enable V2 compatibility.

5. `V2-FR-RUN-005`  
Requirement: Remote sandbox network policy must be phased: controlled allowlist egress for dependency build/sync stage, and deny-by-default egress for test/execution stage; test generation must default to isolated network mocks for external dependencies.  
Priority: P0  
Acceptance: Build-stage egress is restricted to approved package mirrors/proxies; execution-stage egress attempts are blocked and logged; generated tests use mocks by default for external services.

6. `V2-FR-RUN-006`  
Requirement: Remote sandbox runs must enforce execution timeout, dynamically calculated based on language profile (for example longer base limits for compiled languages such as Java and .NET to accommodate build and dependency resolution phases). Language timeout profiles must be managed as versioned server-side dynamic config entries using the same operator-controlled config store defined in `V1-FR-OPS-001`, with default baselines defined at release and overridable per organization by admin policy. A hard ceiling remains configurable only by admin policy.  
Priority: P0  
Acceptance: Timeout always terminates run and marks deterministic failure state.

7. `V2-FR-RUN-007`  
Requirement: Job completion or termination must trigger secure wipe verification for writable workspace data and ephemeral execution disks under zero-retention policy; persisted delivery artifacts must follow retention policy controls.  
Priority: P0  
Acceptance: Terminal state is allowed only after wipe verification evidence is recorded, and retained artifacts are policy-tagged for TTL deletion.

8. `V2-FR-RUN-008`  
Requirement: Server sandbox must support dependency caching via read-only base cache plus per-job copy-on-write writable layer; cache scope must be strictly isolated by `organization_id` and `repository_id`, and cross-tenant cache sharing is prohibited. Secure wipe scope must always include writable workspace volumes and per-job CoW layers while preserving cache isolation boundaries. For legacy tests requiring external datastores, sandbox must support ephemeral service containers (for example Testcontainers for PostgreSQL or Redis) managed within same isolated microVM boundary; ephemeral service container images must be sourced exclusively from approved build-stage egress allowlist and must not persist data beyond job terminal state.  
Priority: P1  
Acceptance: Repeated jobs can reuse base cache while job-specific dependency updates work in isolated CoW layer and are wiped at terminal state.

9. `V2-FR-RUN-009`  
Requirement: For integration-test scenarios requiring real external calls, system must support strict spec-approved FQDN egress allowlist policy for entitled enterprise users only; all other executions remain deny-by-default during test/execution stage.  
Priority: P1  
Acceptance: Allowlist mode is off by default, audited per job, and restricted to explicit approved FQDN entries.

10. `V2-FR-RUN-010`  
Requirement: When strong external dependencies are detected for non-enterprise tiers without allowlist entitlement, workflow must surface explicit reliability warning and offer policy-gated characterization baseline mode or mock-only mode selection.  
Priority: P1  
Acceptance: Dependency-risk detection, chosen mode, and confidence/risk label are recorded and visible in execution evidence.

### 8.5 Unified Workflow and Spec Management
1. `V2-FR-WF-001`  
Requirement: One canonical workflow model must serve both IDE and web starts.  
Priority: P0  
Acceptance: Status/state semantics and transitions are identical.

2. `V2-FR-WF-002`  
Requirement: BDD/SDD revisions are source-of-truth objects shared across surfaces. Cross-surface spec edits must enforce field-level optimistic locking: client submits edit with current revision token; if revision mismatch is detected server-side, server returns `SPEC_REVISION_CONFLICT` with diff payload. Client must present conflict-resolution UI before retry. Silent Last-Write-Wins overwrite is prohibited.  
Priority: P0  
Acceptance: Successful commits are propagated to connected surfaces through Server-Sent Events (SSE) within `<= 2s`; concurrent conflicting writes return deterministic `SPEC_REVISION_CONFLICT` responses with no silent overwrite.

3. `V2-FR-WF-003`  
Requirement: Workflow must preserve baseline-gate and max 10 retry policies in all modes.  
Priority: P0  
Acceptance: Policy cannot be bypassed by execution mode selection.

4. `V2-FR-WF-004`  
Requirement: Web and IDE must receive near-real-time mirrored state updates for the same job via Server-Sent Events (SSE) stream contracts.  
Priority: P0  
Acceptance: State, attempt counters, and terminal outcomes remain consistent across both surfaces.

5. `V2-FR-WF-005`  
Requirement: State transitions must use revision-based locking to prevent cross-surface race conditions (cancel/resume/escalate conflicts).  
Priority: P0  
Acceptance: Stale transition commands are rejected with conflict response and no double-transition side effects.

6. `V2-FR-WF-006`  
Requirement: Client connectivity handling must be mode-aware: IDE-attached local execution must enforce heartbeat and orphan timeout control; remote execution must continue on disconnect and remain deliverable via web and IDE sync.  
Priority: P0  
Acceptance: Heartbeat loss beyond policy timeout halts cloud token generation for IDE-attached local jobs, while remote jobs continue and are retrievable after reconnect.

7. `V2-FR-WF-007`  
Requirement: Cross-surface context assembly must enforce strict file-type allowlists and line-length/entropy heuristics to reject binary files, compiled assets, and minified bundles before AST parsing or token counting.  
Priority: P0  
Acceptance: Blocked files are excluded with machine-readable reason codes and surfaced to user as actionable scope-adjustment guidance.

8. `V2-FR-WF-008`  
Requirement: `REMOTE_HEAD_CONFLICT` must support policy-gated auto-rebase and baseline revalidation branch before terminal failure, preserving deterministic audit trail.  
Priority: P0  
Acceptance: Conflict handling attempts are traceable and converge to either validated delivery or explicit terminal conflict reason.

### 8.6 Team and Enterprise Controls
1. `V2-FR-TEAM-001`  
Requirement: Teams can manage members and role scopes within projects.  
Priority: P1  
Acceptance: Role assignments control visibility and mutation rights.

2. `V2-FR-TEAM-002`  
Requirement: Enterprise admins can configure policy rules for model/provider use and execution mode restrictions.  
Priority: P1  
Acceptance: Policy settings are applied and visible in audit logs.

3. `V2-FR-TEAM-003`
Requirement: Audit viewer must provide searchable event timelines by user/job/repo.
Priority: P1
Acceptance: Admin can filter and export scoped audit history.

4. `V2-FR-TEAM-004`
Requirement: Team leads can assign delivered diff artifacts to specific reviewers with in-app and email notification.
Priority: P2
Acceptance: Assignee receives notification with direct link to delivery review screen within 60 seconds of assignment.

5. `V2-FR-TEAM-005`
Requirement: Delivery diff review screen must support inline comment threads anchored to a specific file or hunk.
Priority: P2
Acceptance: Comments persist in job detail view and are visible in audit timeline.

6. `V2-FR-TEAM-006`
Requirement: Org admins can configure required reviewer count before patch apply is permitted in team workspace.
Priority: P2
Acceptance: Apply is blocked until minimum review threshold is met; block reason is surfaced to initiator with list of pending reviewers.

V2 Nice-to-Have for Enterprise GTM:

4. `V2-FR-TEAM-004`  
Requirement: Team leads can assign delivered diff artifacts to specific reviewers with notification.  
Priority: P2  
Acceptance: Assignee receives in-app and email notification with direct link to delivery review screen.

5. `V2-FR-TEAM-005`  
Requirement: Delivery diff review screen must support inline comment threads anchored to specific file or hunk.  
Priority: P2  
Acceptance: Comments persist in job detail view and are visible in audit timeline.

6. `V2-FR-TEAM-006`  
Requirement: Org admins can configure required reviewer count before patch apply is permitted in team workspace.  
Priority: P2  
Acceptance: Apply is blocked until minimum review threshold is met; block reason is surfaced to initiator.

### 8.7 Billing and Usage Expansion
1. `V2-FR-BIL-001`  
Requirement: Usage model shall include premium dimensions for server sandbox minutes and advanced pipeline runs.  
Priority: P0  
Acceptance: Usage ledger stores premium counters and plan consumption.

2. `V2-FR-BIL-002`  
Requirement: Billing screens shall clearly separate included quota vs overage.  
Priority: P0  
Acceptance: User can identify current month included usage and projected overage.

3. `V2-FR-BIL-003`  
Requirement: API usage and sandbox usage must be visible in both web and IDE summary surfaces.  
Priority: P1  
Acceptance: Both surfaces show synchronized usage counters.

4. `V2-FR-BIL-004`  
Requirement: Usage billing dimensions must include remote compute seconds/minutes and premium model tier usage, separated from base plan usage.  
Priority: P0  
Acceptance: Ledger exposes per-dimension counters suitable for invoice and dispute review.

5. `V2-FR-BIL-005`  
Requirement: Plans that support overage purchase must provide metered usage reporting and reconciliation APIs.  
Priority: P1  
Acceptance: Metered records can be traced from job execution to invoice line items.

6. `V2-FR-BIL-006`  
Requirement: If premium compute quota or metered billing limits are exhausted mid-execution, remote sandbox must be gracefully terminated and transition to `FAILED` with reason code `INSUFFICIENT_FUNDS`, followed by mandatory secure wipe flow.  
Priority: P0  
Acceptance: Mid-run exhaustion always yields deterministic terminal reason and secure-wipe evidence.

7. `V2-FR-BIL-007`  
Requirement: Billing ownership must be explicit per job via billing subject (`USER` or `ORG`). Jobs started in team/org workspace must charge organization wallet by default; personal workspace jobs must charge user wallet.  
Priority: P0  
Acceptance: Every usage/billing record is attributable to a single billing subject with workspace-consistent charging behavior.

8. `V2-FR-BIL-008`  
Requirement: Quota consumption must use reservation and distributed locking on absolute allocatable units before execution starts; reservation is committed on chargeable execution and released on non-chargeable termination, preventing oversell under concurrency.  
Priority: P0  
Acceptance: Concurrent multi-session starts cannot oversubscribe quota or produce negative balance due to race conditions.

9. `V2-FR-BIL-009`  
Requirement: Mid-run insufficient-funds handling for metered dimensions must be driven by control-plane spend circuit breaker events, not sandbox-local balance polling.  
Priority: P1  
Acceptance: `INSUFFICIENT_FUNDS` terminal transitions are deterministic, auditable, and consistent with reservation and metering ledgers.

### 8.8 Support, Operations, and Analytics Continuity
1. `V2-FR-OPS-001`  
Requirement: V1 operator controls (dynamic config, kill switch, manual quota adjustments) must remain active for V2 surfaces and remote execution paths.  
Priority: P0  
Acceptance: Operator actions apply consistently to IDE and web job creation and routing.

2. `V2-FR-SUP-001`  
Requirement: Failed and fallback states in web and IDE must provide one-click issue reporting with user consent for contextual log sharing.  
Priority: P0  
Acceptance: Ticket payload includes redacted traces, state history, and job identifiers.

3. `V2-FR-SUP-002`  
Requirement: Enterprise support mode must default to metadata-only issue payloads (state traces and operational metadata only), excluding source code, AST context, and prompt body unless org admin explicitly overrides policy.  
Priority: P0  
Acceptance: Enterprise tickets contain no code-context by default, and any override is policy-guarded and audit-logged.

4. `V2-FR-ANA-001`  
Requirement: Cross-surface telemetry must capture funnel and reliability events (`job_started`, `repo_precheck_blocked`, `remote_conflict_blocked`, `job_delivered`).  
Priority: P1  
Acceptance: Product analytics can segment by surface, tier, model route, and execution mode.

## 9. API Contract Requirements
New contract families required in V2:
1. GitHub connect/list/select/import/revoke APIs.
2. Entitlement capabilities API.
3. Server execution mode control APIs.
4. Team membership and role APIs.
5. Enhanced usage and billing breakdown APIs.
6. Cross-surface real-time state stream APIs with revision token semantics.
7. Remote repo preflight APIs (size/file limits and mandatory path scope validation).
8. Remote head-SHA revalidation and delivery-conflict APIs.
9. Remote compute metering and overage reporting APIs.
10. Compliance APIs (`data_erasure_request`, audit export).
11. GitHub delivery APIs for create-branch/commit/open-pull-request.
12. Billing-subject resolution APIs (user vs organization wallet) for job creation and usage ledgers.
13. Quota reservation transaction APIs (`reserve`, `commit`, `release`) with idempotency keys.
14. Client heartbeat/session-presence APIs and stream contracts for orphan detection (`heartbeat`, `last_seen_at`, mode-aware timeout policy).
15. Remote artifact sync APIs for IDE `Sync Remote Job` diff retrieval/apply workflow.
16. GitHub out-of-band revocation webhook ingestion APIs/events (`github_app_authorization` revoked).
17. Head-conflict auto-rebase/revalidation orchestration APIs.
18. Delivery-policy APIs (`DRAFT_PR` vs `READY_FOR_REVIEW_PR`) with org policy enforcement.
19. Spec-edit concurrency control APIs (revision precondition tokens and conflict responses for cross-surface spec writes).

Contract requirements:
1. Contract versioning remains explicit and backward compatible with V1 clients.
2. Premium action responses include machine-readable denial reason when blocked.
3. Web and IDE clients must consume identical job and spec schemas.
4. State transition APIs must return revision tokens for optimistic concurrency control.
5. Blocking decisions (quota, policy, repo preflight, head conflict) must return stable machine-readable codes.
6. GitHub throttle responses must return retry metadata (`retry_after_seconds`) and map to `REPO_SYNC_THROTTLED`.
7. Delivery contracts must support deterministic PR creation with immutable head reference checks.
8. Billing and usage contracts must expose resolved billing subject for each job/run.
9. Delivery contracts must expose provenance fields (`co_authored_by_agent`, `job_id_reference`) in commit/PR metadata.
10. Quota APIs must guarantee atomic reservation semantics under concurrent starts and return deterministic lock/conflict reason codes.
11. Web-delivery PR contracts must enforce `draft=true` by default for system-created pull requests.
12. Entitlement contracts must expose read-only historical-access capability separately from execution capability.
13. Heartbeat contracts must define deterministic timeout behavior and machine-readable orphan-handling reason codes by execution mode.
14. Remote artifact sync contracts must provide immutable artifact manifest hash and safe-apply preconditions for IDE diff workflow.
15. Integration-test policy contracts must support default mock mode and explicit enterprise FQDN allowlist declarations with audit tags.
16. Remote artifact sync apply contracts must enforce local base-hash/overlap precheck and return deterministic conflict reason codes on block.
17. Revocation contracts must support out-of-band GitHub authorization-revoked events and guarantee immediate token invalidation semantics.
18. Context packaging contracts must reject binary/compiled/minified file inputs pre-AST with stable machine-readable block reason codes.
19. Delivery apply contracts must support assisted conflict-resolution modes (`three_way_merge`, `auto_stash_apply_pop_with_markers`) with explicit user confirmation boundaries.
20. Head-SHA conflict contracts must support auto-rebase + baseline revalidation branch before terminal block, with stable terminal reason codes when exhausted.
21. Support contracts for enterprise mode must enforce metadata-only payload defaults unless audited admin override is active.
22. Billing contracts must expose point-of-no-return checkpoint semantics and `CLIENT_DISCONNECTED` charge policy for cross-surface consistency.
23. Metered billing controls must expose circuit-breaker state transitions used to trigger `INSUFFICIENT_FUNDS` terminal behavior.
24. Spec update contracts must enforce revision precondition checks and return deterministic `SPEC_REVISION_CONFLICT` responses on concurrent writes instead of silent overwrite.
25. Stream contracts must support seamless token refresh/resume semantics for long-lived Server-Sent Events (SSE) sessions without UI-visible auth interruption for valid sessions.
26. GitHub delivery contracts must expose commit-signature verification status and stable policy-block reason codes (for example `SIGNED_COMMIT_REQUIRED`) when branch protection requires verified signatures.

## 10. Prompt Governance and Structured JSON Requirements
1. V1 schema families remain mandatory.
2. New schema family required:
   1. `repo_scope_schema` for repository and path boundaries.
   2. `policy_violation_schema` for controlled denials.
   3. `patch_edit_schema` for pruning-resilient symbolic edit instructions.
3. Prompt pipelines must include policy-aware context:
   1. Tier entitlements.
   2. Repository constraints.
   3. Organization safety rules.
4. Model output normalization and schema validation remain mandatory before workflow ingest.
5. Context packaging must execute file-type allowlist and line-length/entropy heuristics before AST parsing to block binary/compiled/minified inputs.
6. Direct refactor target files must remain unpruned during edit generation; pruning may apply only to dependency context.
7. Patch generation/apply must rely on `patch_edit_schema` (symbolic or exact search-replace operations); each operation must carry stable apply anchors (for example AST node identifier or exact search-block fingerprint) and expected base fingerprint, and line-number-only unified diff cannot be authoritative apply payload.
8. Final delivery diff is a reconstructed artifact generated from full source after successful edit application and validation.

## 11. Data Model Requirements
V2 logical additions:
1. Organization.
2. Team.
3. TeamMemberRole.
4. RepositoryConnection.
5. RepositoryWorkspace.
6. EntitlementSnapshot.
7. PremiumUsageLedger.
8. PolicyRule.
9. PolicyDecisionLog.
10. RepoImportPrecheckRecord.
11. BranchHeadSnapshot.
12. RemoteExecutionSession.
13. SecureWipeEvidence.
14. DataErasureRequest.
15. AuditExportJob.
16. OrganizationWallet.
17. BillingSubjectSnapshot.
18. RepoSyncThrottleEvent.
19. QuotaReservation.
20. CodeProvenanceRecord.
21. DependencyCacheIndex.
22. RepoSyncScratchRecord.
23. ClientHeartbeatSession.
24. IntegrationEgressPolicySnapshot.
25. RemoteDiffSyncRecord.
26. GitHubRevocationEvent.
27. ContextFilterDecision.
28. DeliveryPolicySnapshot.
29. RebaseValidationRecord.
30. MergeAssistRecord.
31. BillingCheckpointRecord.

Mandatory constraints:
1. Repository access records must map to user and org scopes.
2. Every premium execution must map to entitlement snapshot at execution start.
3. Team role checks must apply to all org-scoped resources.
4. Every remote delivery must link to a Head SHA validation record.
5. Every terminal remote run must link to secure wipe evidence.
6. Every job must persist immutable billing-subject snapshot at execution start.
7. Team/org workspace jobs must map to organization billing subject unless explicit policy override is recorded.
8. GitHub throttle/retry decisions must be persisted with retry budget and backoff metadata.
9. Delivery records must persist immutable provenance metadata linking GitHub commit/PR to `job_id`.
10. Quota reservations must persist lock owner/idempotency context for race-safe reconciliation.
11. Repo sync scratch records must capture wipe-completion evidence before disposal.
12. Dependency cache records must include org/repo scope keys and must reject cross-tenant lookup/hit paths.
13. Heartbeat sessions must persist mode-aware timeout policy and last-seen timestamps tied to workflow execution context.
14. Integration egress policy snapshots must be immutable per run and include approved FQDN entries and approver identity.
15. Remote diff sync records must bind artifact hash, requester identity, and apply outcome for auditability.
16. Out-of-band GitHub revocation events must be persisted and linked to token invalidation and active-sync termination actions.
17. Context filter decisions must be persisted with blocked file metadata and machine-readable reason codes for audit and support.
18. Delivery policy snapshot must be immutable per job and linked to resulting PR state.
19. Rebase validation records must capture source head, rebased head, baseline outcome, and terminal resolution.
20. Merge assist records must capture selected strategy, touched files, conflict markers, and user confirmation outcome.
21. Billing checkpoint records must capture point-of-no-return transitions and disconnect charge-policy decisions.

## 12. Workflow and State Requirements
V1 states remain.  
Additional V2 state markers:
1. `REPO_SYNCING`
2. `REMOTE_EXECUTION_QUEUED`
3. `REMOTE_EXECUTION_RUNNING`
4. `REPO_PRECHECK_BLOCKED`
5. `REMOTE_HEAD_CONFLICT`
6. `REMOTE_WIPE_VERIFYING`
7. `REPO_SYNC_THROTTLED`
8. `REPO_SYNC_SCRATCH_WIPING`
9. `CLIENT_HEARTBEAT_LOST`
10. `REMOTE_REBASE_VALIDATING`
11. `SYNC_APPLY_CONFLICT`

Rules:
1. Jobs started in web with GitHub sources must pass repo sync before proposal phase.
2. Remote execution queue and runtime states must remain auditable.
3. Fallback and delivery semantics remain identical to V1 regardless of source surface.
4. Repository preflight (size/file/path scope) must pass before repo sync starts.
5. Delivery transition requires successful Head SHA revalidation; mismatch enters `REMOTE_HEAD_CONFLICT`.
6. Remote terminal states must pass `REMOTE_WIPE_VERIFYING` before completion.
7. Cross-surface state mutation must honor revision locking and reject stale commands.
8. Mid-execution quota or billing-limit exhaustion must transition to `FAILED` with `INSUFFICIENT_FUNDS` reason code and still enforce wipe-verification policy.
9. Third-party API rate-limit responses during repo sync must transition to `REPO_SYNC_THROTTLED`, apply bounded backoff with jitter, and resume sync when retry budget allows.
10. Any control-plane scratch source code created during `REPO_SYNCING` must enter `REPO_SYNC_SCRATCH_WIPING` and be securely wiped immediately after context payload handoff, without persistent retention.
11. Job start must acquire quota reservation before entering execution path; reservation conflict or insufficiency blocks start deterministically.
12. IDE-attached local-execution jobs must maintain heartbeat with control plane; initial heartbeat loss immediately pauses cloud token generation and starts a `300s` grace recovery window.
13. If heartbeat is restored before grace expiry, workflow resumes without terminal disconnect; if unrecovered after grace window, transition to `CLIENT_HEARTBEAT_LOST`.
14. `CLIENT_HEARTBEAT_LOST` transitions to deterministic terminal failure with machine-readable `CLIENT_DISCONNECTED` reason unless resumed under explicit recovery policy.
15. Remote-execution jobs do not halt on IDE/web disconnect; they continue and remain deliverable through web workspace and IDE sync endpoints.
16. Integration-test allowlist mode is valid only with explicit spec approval and entitled policy scope; otherwise test/execution remains deny-by-default egress.
17. Out-of-band GitHub authorization revocation during active sync must terminate sync operations and invalidate tokens immediately.
18. `Sync Remote Job` apply must block direct write on local overlap conflict until workspace divergence is resolved. Segment A path must use plain-language save/discard guidance without git terms; Segment B/C paths may use manual git guidance (stash/commit/rebase) or approved assisted-merge mode.
19. If Head SHA drifts and policy permits auto-rebase, workflow transitions through `REMOTE_REBASE_VALIDATING` and reruns baseline validation before delivery.
20. If local overlap conflict is detected during remote-to-local apply, workflow enters `SYNC_APPLY_CONFLICT` and supports assisted merge modes prior to final write.
21. Point-of-no-return billing checkpoint behavior for disconnect scenarios must remain consistent with V1 state-defined charge policy.

## 13. UX and UI Requirements (Critical)

> Design specification documents:
> - Design system (icons, typography, color, components): `Docs/UX/UX-DESIGN-SYSTEM.md`
> - IDE wireframe spec (V1 flows + V2 sync flows): `Docs/UX/UX-WIREFRAME-IDE.md`
> - Web workspace wireframe spec (V1 portal + V2 workspace): `Docs/UX/UX-WIREFRAME-WEB.md`
> Icon library: **Lucide** (primary). No emoji in functional UI. No AI chat-bubble layout.
> Custom SVGs (including Gemini-generated) acceptable if they match Lucide stroke style: 2px stroke, rounded caps, 24x24 viewBox, currentColor fill.

### 13.1 Design principle continuity
1. No generic AI-chat visual identity.
2. Engineering-workbench style with risk/status first.
3. Strong typography and hierarchy across IDE and web.

### 13.2 Web workspace design constraints
1. Must not mimic consumer chat assistant layout.
2. Must show explicit stage map and evidence panels.
3. Must surface repository scope and branch context at all times.
4. Must display entitlement state and premium meter clearly.
5. Must display repository scope limits, remote security mode, and conflict state clearly.
6. Must show throttled-sync waiting state with retry timing and user-action options.
7. Must clearly indicate test network mode (`Mocked External Calls` vs `Enterprise Allowlist`) and associated risk/compliance badge.
8. Must provide explicit local divergence conflict warnings in `Sync Remote Job` apply flow with no silent overwrite path; Segment A copy must be plain-language and must not include git terminology.
9. Must provide assisted conflict-resolution options for sync apply (`three_way_merge` and/or `auto_stash_apply_pop_with_markers`) with explicit user confirmation for Segment B/C users; Segment A receives guided block-and-resolve flow only.
10. Must display delivery policy selector (`Draft PR` vs `Ready for review PR`) with CI-impact explanation at setup time.

### 13.3 Required web screens
1. GitHub connection and repo picker.
2. Web refactor setup.
3. Spec workbench (BDD+SDD).
4. Execution monitor.
5. Delivery and diff review.
6. Team and role settings.
7. Policy and audit center.
8. Usage and compute billing details.
9. Support and issue-report entry points.
10. Pull request delivery confirmation and destination-link view.
11. Remote job sync entrypoint and IDE handoff guidance view.
12. Sync conflict-resolution workbench for assisted merge review.

### 13.4 Cross-surface UX consistency
1. Terminology and state names must be identical between IDE and web.
2. Same color semantics for risk and status levels.
3. Same fallback concepts and evidence structure.
4. User-triggered actions (cancel/retry/escalate) must resolve identically under revision-lock conflict rules.
5. Cross-surface delivery must support consistent "open in IDE diff" action for completed remote jobs.
6. Conflict semantics for remote-to-local apply must be deterministic and consistent across IDE entry points.
7. Delivery policy semantics (Draft/Ready) must remain consistent between setup, execution logs, and final PR outcome.

## 14. Security and Compliance Requirements
1. GitHub token storage must follow secret management policies.
2. Premium features must not expose privileged execution paths to non-entitled users.
3. Repo and org access boundaries must be enforced at API and data layers.
4. Audit trail immutability required for enterprise governance.
5. Sensitive data redaction policies apply to logs, prompts, and error traces.
6. Remote execution isolation must satisfy microVM-class boundary requirements.
7. Remote execution must enforce phased network policy with strict allowlist in build/sync and deny-by-default in test/execution.
8. Zero-retention secure wipe must be mandatory and auditable for writable workspace and ephemeral execution data per job.
9. Right-to-be-forgotten API must support cascaded deletion across identity metadata, jobs, usage, and logs.
10. Code-bearing artifacts/logs and repo-sync scratch source data must follow TTL-based hard-delete policy (default `14 days` for artifacts/logs, immediate wipe for sync scratch) with auditable evidence.
11. Dependency cache sharing across organizations/repositories is prohibited; cache isolation boundaries must be auditable.
12. Integration-test external egress exceptions must be explicit, FQDN-scoped, entitlement-gated, and auditable with approver identity.
13. Out-of-band GitHub authorization revocations must trigger immediate access invalidation and controlled sync termination without relying on portal-side revoke action.
14. Enterprise support submissions must default to metadata-only payloads unless policy-governed admin override is enabled and audited.
15. Product telemetry payloads must remain metadata-only and must not include raw BDD/SDD text, keystroke logs, AST/source fragments, or prompt body content.
16. Enterprise organizations must support policy-enforced `Zero Telemetry Mode` that disables funnel/behavior tracking across IDE and web surfaces while retaining mandatory security/audit events.
17. GitHub delivery must comply with signed-commit branch protection policies; unsigned or unverified commit signatures must block merge-path delivery with auditable reason.

## 15. Non-Functional Requirements
1. Remote execution queue start SLA target: `< 60s` for normal load.
2. Web workspace live update interval: `<= 2s`.
3. Job execution mode switch reliability: no orphaned workflow instances.
4. API and stream reliability equal to or better than V1.
5. Head-SHA revalidation check p95 latency target: `< 5s`.
6. Remote secure wipe verification target after run termination: `< 10s`.
7. Repository preflight checks must fail fast for hard-limit violations before expensive parsing.
8. Third-party API throttling handling must use bounded exponential backoff with jitter and must not hard-fail while retry budget remains.
9. Throttled sync state propagation to UI and logs target: `<= 2s`.
10. Quota reservation lock acquisition and decision response target: `<= 300ms` p95 under normal load.
11. Heartbeat timeout decision and token-halt propagation for IDE-attached local execution must complete within `<= 10s` after timeout threshold breach.
12. Remote artifact sync manifest retrieval for IDE diff handoff target: `< 2s` p95 under normal load.
13. Out-of-band GitHub revocation processing (webhook ingest to token invalidation) target: `<= 30s` p95.
14. Auto-rebase validation cycle target from head-drift detection to baseline verdict: `<= 120s` p95 under normal load.
15. Sync assisted-merge preparation (conflict analysis + proposal rendering) target: `<= 5s` p95 for normal repository scope.
16. Long-lived stream token refresh/resume for active job Server-Sent Events (SSE) sessions target: `<= 5s` p95 under normal load.

## 16. QA and Acceptance
Mandatory V2 test domains:
1. Entitlement gating correctness.
2. GitHub access scoping and repo targeting.
3. Remote sandbox isolation and cleanup.
4. Cross-surface spec synchronization.
5. Web workspace completion path.
6. Premium usage metering accuracy.
7. Team role-based authorization.
8. UI conformance to anti-AI-look constraints.
9. Cross-surface race-condition handling and revision lock behavior.
10. Head SHA conflict detection and safe recovery UX.
11. Repo preflight hard-limit enforcement.
12. Remote egress blocking and secure wipe evidence integrity.
13. GDPR data erasure and enterprise audit export authorization.
14. GitHub integration revocation behavior (immediate sync stop, token destruction, and audit trace).
15. Mid-execution billing/quota exhaustion behavior (`INSUFFICIENT_FUNDS`, graceful termination, mandatory wipe).
16. Phased network policy correctness (build allowlist egress vs execution deny-by-default).
17. Web delivery PR flow (create branch/commit/PR) and fallback patch flow.
18. Billing subject ownership rules (team/org workspace vs personal workspace charging).
19. GitHub throttling state path (`REPO_SYNC_THROTTLED`) with bounded backoff and resume behavior.
20. Quota double-spending race tests across multi-session concurrent starts with atomic reserve/commit/release validation.
21. Code provenance tests validating required `Co-authored-by` and `job_id` markers in GitHub delivery.
22. Dependency cache isolation tests ensuring read-only reuse with strict workspace wipe.
23. Repo-sync scratch wipe tests ensuring no control-plane raw source persists after payload handoff.
24. Cache poisoning prevention tests ensuring no cross-tenant cache hit across org/repo boundaries.
25. Draft-PR default tests ensuring web-delivery PRs are created in draft state.
26. Downgrade behavior tests ensuring free-tier read-only access to historical paid-period artifacts/logs with execution blocked.
27. Integration-test egress policy tests validating default mock generation and entitlement-gated strict FQDN allowlist behavior.
28. IDE disconnect heartbeat tests for local execution ensuring disconnect enters pause+grace handling, resumes when heartbeat recovers in-window, and only transitions to deterministic terminal failure after grace expiry.
29. Remote execution disconnect tests ensuring jobs continue and are retrievable via web and IDE `Sync Remote Job`.
30. Web-to-IDE handoff tests validating secure remote diff sync, native IDE review, and safe apply/reject behavior.
31. Context file-bomb tests ensuring binary files, compiled assets, and oversized minified bundles are blocked pre-AST with machine-readable reasons.
32. Diverged local tree tests ensuring `Sync Remote Job` apply is blocked on overlapping uncommitted local changes with explicit conflict guidance.
33. Out-of-band revocation tests ensuring GitHub-side revoke events terminate active sync, invalidate tokens, and block stale access immediately.
34. Pruning-resilient delivery tests ensuring `patch_edit_schema` operations generated with pruned dependencies apply correctly to full unpruned target files.
35. Dependency cache CoW tests ensuring job-scoped dependency updates work in writable overlay and are wiped at terminal state.
36. Head-drift auto-rebase tests ensuring `REMOTE_REBASE_VALIDATING` path reruns baseline and converges to delivery or explicit terminal conflict.
37. Sync conflict assisted-resolution tests covering `three_way_merge` and `auto_stash_apply_pop_with_markers` with explicit user confirmation.
38. Delivery policy tests ensuring `DRAFT_PR` and `READY_FOR_REVIEW_PR` outcomes match setup policy and org guardrails.
39. Enterprise support payload tests ensuring metadata-only default and audited override path for contextual sharing.
40. Disconnect checkpoint billing tests ensuring point-of-no-return charging remains consistent with V1 policy across IDE and web retrieval paths.
41. Timeout classification tests ensuring `TIMEOUT_EXECUTION` handling is distinct from logic-failure retry policy.
42. Spec concurrent-edit tests across IDE/Web ensuring revision-precondition conflict handling (or field-level lock path) prevents silent Last-Write-Wins overwrite.
43. Long-lived stream auth tests ensuring token rollover during active jobs does not surface UI `401` interruptions or false orphan transitions.
44. Signed-commit compliance tests ensuring branch-protected repositories requiring verified signatures accept platform delivery only when commit signatures are valid, and reject with deterministic reason otherwise.
45. Enterprise `Zero Telemetry Mode` tests ensuring funnel/behavior payloads are suppressed while mandatory security/audit events remain intact.

Release gate:
1. No P0/P1 security defects.
2. Entitlement bypass test suite must pass 100%.
3. Billing and usage reconciliation variance `< 1%`.
4. No unresolved P0 findings in remote isolation/secure-wipe validation tests.
5. Cross-surface state consistency tests must pass with concurrent action simulation.

## 17. Migration and Compatibility Requirements
1. Existing V1 users and data must migrate without workflow history loss.
2. V1 extension clients remain functional without forced immediate upgrade.
3. V2 features appear progressively based on entitlement and client capability.

## 18. Risks and Mitigations
1. Risk: Premium feature complexity damages UX clarity.  
Mitigation: enforce stage-first IA and progressive disclosure.

2. Risk: Repo permission misconfiguration exposes source code.  
Mitigation: least-privilege scopes, explicit repo approval, auditable token use.

3. Risk: Billing distrust due to unclear premium usage dimensions.  
Mitigation: transparent usage dashboards and explainable counters.

4. Risk: Visual drift into generic AI interfaces.  
Mitigation: mandatory design governance checklist and review sign-off.

5. Risk: Remote execution security failure causes code exposure.  
Mitigation: microVM isolation, egress deny, secure wipe evidence, and release-gate security validation.

6. Risk: Web/IDE concurrent actions cause inconsistent job states.  
Mitigation: revision-lock transitions, unified stream contracts, and conflict-safe UX actions.

7. Risk: Third-party API throttling causes false failures and user distrust.  
Mitigation: explicit throttled state, bounded backoff/retry policy, and transparent retry timing in UI.

8. Risk: Ambiguous billing ownership in team workflows causes disputes.  
Mitigation: immutable billing-subject snapshot per job and workspace-scoped default charging rules.

## 19. Deliverables Checklist
1. Updated product requirement spec approved.
2. V2 API contract catalog approved.
3. Entitlement matrix approved.
4. GitHub integration and policy requirements approved.
5. Cross-surface UX specification approved.
   - Web workspace wireframes: `Docs/UX/UX-WIREFRAME-WEB.md`
   - IDE wireframes (updated for V2 sync flows): `Docs/UX/UX-WIREFRAME-IDE.md`
6. QA matrix including premium and enterprise paths approved.
7. Architecture Decision Records complete.
   - ADR-003 (V2 Sandbox): `Docs/ADR/ADR-003-V2-Sandbox-Execution.md` — **DECIDED: E2B self-hosted (gVisor/Firecracker)**
   - ADR-001 and ADR-002 (inherited from V1) remain active and backward-compatible.

All checklist items are mandatory before declaring V2 complete.
