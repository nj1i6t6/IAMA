# IAMA Product Requirements - V1 (English)

Document ID: `IAMA-PRD-V1-EN`  
Version: `1.0`  
Status: `Approved for Build`  
Audience: Product, Design, Backend, Extension, QA, AI Agent Developers

## 1. Purpose
This document defines the complete V1 product requirements for IAMA.  
V1 is not an MVP. It is a production-grade release focused on low-risk refactoring with cloud control and IDE-first execution.

This is a requirements document, not an implementation guide.  
Engineers and agents must satisfy all required behaviors and acceptance criteria.

## 2. Product Definition
IAMA is an AI-powered refactoring product that helps users modernize legacy code with strict risk controls.

Core value:
1. Preserve behavior.
2. Make changes auditable.
3. Provide safe fallback paths when automation fails.

Core method:
1. Proposal selection.
2. Natural-language BDD and SDD refinement.
3. TDD generation and baseline verification.
4. Self-healing patch loop.
5. Diff-first delivery.

**Tier positioning (non-normative ??for marketing and design alignment):**

| Tier | Positioning |
|------|------------|
| Free | "Experience AI-driven refactoring" |
| Plus | "Structured refactoring within budget" |
| Pro | "Refactoring that doesn't interrupt your workflow" |
| Max | "Solves what other tiers can't" |
| Enterprise | "Same-ecosystem legacy modernization at monorepo scale" |

> **Hard constraint**: Enterprise positioning must NOT claim cross-ecosystem support (e.g., COBOL?ava) as "fully automated" in any sales material. Cross-ecosystem is "supported with mandatory behaviour coverage review." COBOL with CICS-native mainframe APIs, RPG, and Assembler remain out of scope for all tiers.

## 3. User Segments
### 3.1 Segment A - Non-technical or low-code users
1. Can describe expected behavior in natural language.
2. Must not be blocked by technical terms.
3. Needs guided UX with safe defaults.

### 3.2 Segment B - Technical developers
1. Wants detailed control of boundaries, tests, and risks.
2. Expects transparent logs and deterministic workflow states.
3. Needs editable BDD and SDD with traceable history.

### 3.3 Segment C - Enterprise teams
1. Needs governance, policy enforcement, usage control, and audit.
2. Requires account and billing management on web portal.
3. Requires role-aware access controls and compliance-ready records.

## 4. Product Goals
### 4.1 Business goals
1. Deliver production-ready refactoring experience in VS Code with cloud account management.
2. Support subscription-based monetization from day one.
3. Prepare architecture for web-based GitHub refactoring in V2.

### 4.2 Product goals
1. Minimize behavior regression risk.
2. Keep user in control during strategy and spec stages.
3. Ensure every result is explainable through test and workflow evidence.

### 4.3 Success metrics
1. Refactoring success rate (job ends in SUCCESS): `>= 75%` in target pilot repos.
2. Baseline validity rate (old code passes generated baseline tests): `>= 90%`.
3. Critical regression escape rate after user acceptance: `< 5%`.
4. Time-to-first-diff median: `< 12 minutes` for medium repo jobs.
5. User completion rate from job start to delivery: `>= 65%`.
6. These metrics are targeted product OKRs for maturity tracking, not hard V1 release-block gates by themselves; release gates are defined in Section 17.

## 5. Scope
### 5.1 In scope for V1
1. VS Code extension workflow for refactoring.
2. Web authentication, registration, subscription, billing portal entry, and usage visibility.
3. Cloud LLM proxy with system-level prompt governance.
4. IDE-side execution with selectable local execution profiles (`Local Docker` and `Local Native`) and risk labeling.
5. Workflow orchestration, logs, retry loop, fallback intervention workspace, and artifact delivery.
6. Language and Framework Support: V1.0 scope is same-ecosystem modernization only. Black-Box Orchestration baseline mode is in scope for V1.0 only when triggered within same-ecosystem jobs due to low AST parser confidence.
7. Simple Mode (蝪⊥?璅∪?): guided UX for non-technical users ??natural-language-first spec, plain-language proposals, no technical jargon above the fold.
8. Professional Mode (撠平璅∪?): technical-detail-first UX ??technical risk analysis, performance comparison, architecture impact, and for Enterprise accounts: ROI and cost analysis report.

**Cross-ecosystem refactoring scope (authoritative version matrix):**

V1.0 in scope (same-ecosystem modernization):
- Python 2 ??Python 3
- JavaScript ??TypeScript
- Java 8 ??Java 21
- React Class Components ??React Hooks
- Black-Box Orchestration mode available when AST confidence < 40%

V1.0 out of scope (cross-ecosystem):
- Cross-ecosystem language/framework pairs are explicitly out of scope for V1.0.
- Cross-ecosystem support is deferred to V1.x experimental and governed by the approved source language matrix in `V1-FR-OPS-001` dynamic config.

V1.x experimental (Enterprise tier only, with Black-Box mode + behaviour coverage acknowledgement gate):
- VB6 ??C# / Python
- Delphi / Pascal ??Python / Java
- COBOL standard commercial logic ??Java / Python (labeled: "supported with mandatory behaviour coverage review")

Out of scope (all tiers, all versions, unless explicitly added to dynamic config matrix):
- COBOL with CICS-native mainframe APIs
- RPG
- Assembler
- Any language where AST parser confidence < 20% AND no Black-Box CLI/HTTP interface is available AND no `EXACT_SEARCH_REPLACE` fallback is viable

AST fallback policy for low-confidence legacy languages: if Tree-sitter confidence < 20%, system automatically falls back to pure `EXACT_SEARCH_REPLACE` mode (string-level operations only) + Black-Box CLI/HTTP orchestration testing. Custom-built AST parsers per language are explicitly not in scope.

**AST Confidence Score Definition (authoritative)**:
The confidence score is a composite integer (0–100) computed by the Tree-sitter AST analysis layer before each job enters `REFACTORING`. Components and weights:

| Component | Weight | Description |
|---|---|---|
| Parse success rate | 40% | Fraction of selected target files parsed without syntax errors by Tree-sitter. 1.0 = all files parsed cleanly. |
| Symbol resolution rate | 35% | Fraction of `symbolic_replace` anchor candidates (function/class/method names) found and uniquely resolvable in the AST. Duplicate symbols or missing symbols count as 0. |
| Snippet completeness | 25% | Fraction of code snippets sent to the LLM that are syntactically complete AST subtrees (not mid-block truncations). Pruned snippets that break at statement boundaries score 0 for this component. |

Formula: `confidence = round(0.40 × parse_rate + 0.35 × symbol_rate + 0.25 × snippet_completeness) × 100`

Threshold policy:
- `confidence ≥ 40`: Default AST-symbolic mode proceeds (`AST_SYMBOLIC` operations).
- `20 ≤ confidence < 40`: System auto-triggers Black-Box Orchestration mode. User may manually override to continue AST-symbolic mode after explicit acknowledgement.
- `confidence < 20`: System falls back to `EXACT_SEARCH_REPLACE` only. AST-symbolic operations are prohibited for this job.

The threshold values are configurable server-side via `feature.baseline_ast_confidence_threshold` in `dynamic_configs` (see `DB_SCHEMA.md` Section 8.1).

### 5.2 Out of scope for V1
1. Web-based direct repo editing.
2. Server-side sandbox execution for normal users.
3. Multi-repo orchestration in a single job.
4. Enterprise SSO/SCIM.
5. Automated pull request creation to remote VCS.
6. Remote or customer-managed execution target integration (for example mainframe-hosted COBOL or RPG) is explicitly out of scope for V1 and V2.

## 6. High-Level Architecture
### 6.1 Planes
1. Cloud control plane:
   1. Identity, subscription, usage metering, LLM proxy, job metadata, audit logs.
2. IDE execution plane:
   1. Local code access, local execution profile (`Docker` or `Native`) test runs, local diff rendering.

### 6.2 Components
1. VS Code Extension + Webview UI.
2. Web Portal (account, billing, usage, org settings placeholder).
3. API Gateway with tier-aware rate limiting and abuse protection.
4. Auth Service.
5. Subscription and usage service.
6. Job service and workflow orchestration service.
> [DECIDED ??See ADR-001]
> Workflow engine: **Temporal.io** (self-hosted, Python SDK).
> Decision records, rationale, and action items in `Docs/ADR/ADR-001-Workflow-Engine.md`.
> Backend scaffolding must align to Temporal activity/workflow model defined in ADR-001.
7. LLM proxy service with prompt templates and JSON schema enforcement.
> [DECIDED ??See ADR-002]
> LLM proxy: **LiteLLM Python library** as base layer + custom IAMA LLM Router on top.
> Decision records, rationale, and routing table in `Docs/ADR/ADR-002-LLM-Proxy.md`.
> Do not build a fully custom proxy; LiteLLM handles provider translation and cost tracking.
8. Persistence layer (PostgreSQL).
9. Local sandbox runner via Docker.
10. Local native test runner profile.
11. Client heartbeat/presence tracker for IDE-attached execution control.

## 7. Data Processing Boundaries
### 7.1 Data that stays local
1. Full working project files by default.
2. Local sandbox run files and temporary test artifacts.
3. Local editor state and unsaved buffers.

### 7.2 Data sent to cloud
1. User identity and billing data.
2. Job metadata and workflow state.
3. Usage events and audit events.
4. LLM prompt payload containing selected code slices, resolved dependency interface contents (AST-derived), and approved specs.
5. Heartbeat/session-presence metadata for active IDE-attached jobs.

### 7.3 Data sent to model providers (via IAMA cloud proxy)
1. Prompt content after cloud-side policy filtering and prompt templating.
2. No direct client-to-provider communication is allowed.

## 8. End-to-End User Journey
1. User installs extension and clicks login.
2. Browser-based auth completes and token is returned to extension securely.
3. User selects execution profile (`Local Docker` or `Local Native`) during first-run setup and can change it later in extension settings.
4. User selects target folder/files and starts a refactor job.
5. Extension sends job creation request and relevant dependency-aware context.
6. User receives 3 strategy proposals and selects one.
7. User reviews/edit BDD and SDD in natural language.
8. Workflow generates tests, validates baseline on legacy code, then runs refactor loop.
9. User watches live logs in IDE.
10. If success, user receives diff and artifact summary.
11. If failed after retry budget, user enters guided fallback conversation.
12. Usage and billing info stay visible in both web portal and extension summary panel.
13. If IDE disconnects during IDE-attached execution, cloud token generation pauses immediately and only transitions to orphan termination after grace timeout expiry, preventing avoidable cost burn from brief network interruptions.

## 9. Functional Requirements
Format:
1. `ID` - unique requirement identifier.
2. `Requirement` - mandatory behavior.
3. `Priority` - P0/P1/P2.
4. `Acceptance` - objective completion criteria.

### 9.1 Identity and Account
1. `V1-FR-AUTH-001`  
Requirement: System shall support email/password registration and login.  
Priority: P0  
Acceptance: User can create account, authenticate, and receive valid session/JWT.

2. `V1-FR-AUTH-002`  
Requirement: System shall support browser-based OAuth login from VS Code.  
Priority: P0  
Acceptance: Clicking login in extension opens browser auth and returns authenticated IDE session.

3. `V1-FR-AUTH-003`  
Requirement: Tokens and secret validation rules shall be consistent across all backend modules.  
Priority: P0  
Acceptance: No valid token fails due to mismatched secret defaults.

4. `V1-FR-AUTH-004`  
Requirement: Extension and web clients must perform seamless token refresh for long-lived Server-Sent Events (SSE) job streams without user-visible authentication interruption.  
Priority: P0  
Acceptance: Token expiration during active job streams does not drop active job monitoring; client refresh/resume flow avoids UI-surfaced `401` for valid sessions.

### 9.2 Subscription and Usage
1. `V1-FR-SUB-001`  
Requirement: Web portal shall expose plan details, current tier, and upgrade path.  
Priority: P0  
Acceptance: Logged-in user can view tier entitlements and billing actions.

2. `V1-FR-SUB-002`  
Requirement: System shall meter usage per user and per job.  
Priority: P0  
Acceptance: Usage records include prompt volume, job count, and sandbox runtime indicators.

3. `V1-FR-SUB-003`
Requirement: VS Code extension shall display usage summary and remaining quota using the following display policy. Raw credit numbers (e.g., "280 Credits") must **never** be the primary communication layer. Credits are a backend accounting unit only; the user communication layer uses percentages and human-readable proxies.

**Usage display policy:**

Primary display (always visible, IDE and web):
- Progress bar + percentage: e.g., `[??????????] 65%`
- Human-readable proxy (secondary small text): "~18 typical refactors remaining" ??computed from remaining credits 繩 rolling 7-day average cost per completed job (default: 25C/job if no history).

Hover / expand (user-initiated only):
- Absolute remaining credit count.
- Daily jobs remaining and reset time.
- Monthly reset date.

Billing portal (all paid tiers):
- Actual dollar amounts consumed ($x.xx used this cycle).
- Per-job credit consumption history.
(Required for legal transparency; not hidden behind a further gate.)

Enterprise billing portal only:
- Full credit ledger with dollar amounts, per-job and per-user breakdown, invoice-grade detail.

Job pre-flight display (before job starts):
- "Estimated credit range: ~2??% of your remaining monthly balance" (computed from rolling average; shown as % range, never raw credits).
- If estimated cost exceeds 50% of daily job limit usage: show soft warning before allowing start.

L3 / Deep Fix confirmation (mandatory before dispatch):
- "Deep Fix will activate the highest-tier reasoning model. Estimated consumption: approximately 15??0% of your remaining monthly balance. This operation cannot be cancelled once started. Proceed?"
- % range shown; raw credit numbers are NOT shown. User must confirm before L3 dispatches.

Add-on purchase display (Pro and Max only):
- Expressed as percentage: "+25% monthly quota" / "+50% monthly quota" ??not as raw credit numbers.
- Plus tier: Add-on not available; user is directed to upgrade to Pro.

Priority: P1
Acceptance: IDE usage panel always shows progress bar + % + human-readable proxy. Raw credit numbers never appear as primary UI. Billing portal shows dollar amounts. L3 confirmation dialog appears before every L3 dispatch with % cost estimate.

4. `V1-FR-SUB-004`
Requirement: The following tier matrix is the authoritative entitlement specification. All subsystems (billing, routing, context assembly, execution scheduler, UX mode gating) must enforce every dimension in this table. This table is server-side truth ??no client claim overrides it.

> **[AGENT OVERRIDE DIRECTIVE]** Max tier context limit is explicitly **200K**, not 500K. Only Enterprise gets 1,000K (1M). Do not revert Max to 500K under any circumstances.

| Dimension | Free | Plus | Pro | Max | Enterprise |
|---|---|---|---|---|---|
| **Monthly credits** | N/A (daily job cap) | 280C | 650C | 1,500C | Contract-defined |
| **Daily job limit** | 3 jobs/day | 8 jobs/day | 20 jobs/day | 40 jobs/day | Contract-defined |
| **Context cap** | 128K | 128K | 200K | 200K | 1M |
| **Available models** | L1 only | L1, L2 | L1, L2 | L1, L2, L3 | All + custom |
| **Operating mode** | Simple Mode only | Simple Mode only | Professional Mode | Professional Mode | Enterprise Mode |
| **Deep Fix** | No | No (manual only) | Yes (context reset + L2 only, no L3) | Yes (L3 with mandatory user confirmation, included) | Yes (L3 with mandatory user confirmation, included) |
| **Execution environment** | Local only | Local only | Local + Cloud sandbox | Local + Cloud sandbox | Dedicated VPC |
| **Web / GitHub integration** | No | No | Yes | Yes | Yes |
| **Enterprise Analysis Report** | No | No | No | No | Yes |
| **Professional Mode features** | No | No | Yes | Yes | Yes |
| **BDD/SDD editing** | Read-only | Full edit | Full edit + Fast-Track | Full edit + Fast-Track + Deep Fix | Full edit + team collaboration + behaviour coverage gate |
| **Concurrent jobs** | 1 | 1 | 2 | 5 | Contract-defined |
| **Add-on available** | No | No (upgrade to Pro) | Yes (+25%/+50%) | Yes (+25%/+50%) | Contract-defined |

Priority: P0
Acceptance: Every entitlement dimension is enforced independently. Context cap violation is blocked before provider dispatch. Mode gate is enforced at job creation. Execution environment gate prevents cloud sandbox scheduling for Free/Plus. Web/GitHub gate blocks those APIs at the router level for Free/Plus. Credit quota is tracked atomically and refuses job start when both (a) today's started job count ??daily job limit and (b) remaining monthly credits < 10C minimum start threshold. All enforcement decisions produce machine-readable denial reason codes.

Note: Context cap parity between Free and Plus (both 128K) is intentional. Differentiation is driven by model access (L1 only vs L1+L2), BDD/SDD editability, daily job quota, and add-on availability, not context window size. Pro and above unlock 200K context as the meaningful upgrade gate. Enterprise is the sole tier with 1M context.

Design rationale for upgrade walls:
- **Free ??Plus**: Daily limit (3/day) and L1-only model access are the primary pain points. Plus removes the daily cap pain, unlocks L2, and enables BDD/SDD editing.
- **Plus ??Pro**: 128K context is too small for real projects; Professional Mode is required for technical visibility; cloud execution removes local environment dependency. Plus cannot buy add-ons ??upgrade to Pro is the only path.
- **Pro ??Max**: Monthly credit quota runs out for heavy users; Max provides 1,500C/month, introduces L3 (Deep Fix), and increases daily job limit and concurrency.
- **Pro/Max ??Enterprise**: 1M context for massive codebases; Enterprise Analysis Report as a sales tool for budget approval; dedicated VPC execution; unlimited model access; team governance.

5. `V1-FR-SUB-005`
Requirement: Quota enforcement operates on a two-layer system (daily job count + monthly credits) as specified in the Credit System Definition in Section 9.10. Free tier uses daily job count only (3/day hard cap, no monthly credit layer). Paid tiers use both layers simultaneously.
Priority: P0
Acceptance: Free-tier daily quota resets at UTC 00:00. Attempts beyond the daily limit return `DAILY_JOB_LIMIT_REACHED` and do not trigger model calls. Paid-tier monthly credit exhaustion returns `INSUFFICIENT_MONTHLY_BALANCE`. Both error codes include `reset_at` field in ISO 8601 format. Plus tier receives add-on upsell CTA; Plus tier cannot purchase add-on directly and must be offered upgrade-to-Pro path.

6. `V1-FR-SUB-006`
Requirement: Model class access shall be enforced per-tier as specified in `V1-FR-SUB-004`. Credit consumption is tracked per call; credit balance depletion triggers `INSUFFICIENT_MONTHLY_BALANCE`. On credit exhaustion: new job creation is blocked; in-flight jobs complete at original entitlement. On L2 model exhaustion (when per-tier L2 caps apply), system falls back to L1 with UI notification. L3 (Deep Fix) requires explicit user confirmation showing estimated credit cost as percentage of remaining monthly balance before any L3 call dispatches.
Priority: P0
Acceptance: Credit consumption is tracked atomically with idempotent reservation semantics. UI shows remaining monthly balance as percentage and human-readable proxy (see `V1-FR-SUB-003`). On credit exhaustion, new job start is blocked with explicit notification and action path. Max and Enterprise users see `[Deep Fix active — context reset — model upgraded to L3]` indicator after L3 confirmation is received and model upgrade begins. L3 confirmation dialog shows estimated cost as % range (not raw credits).

7A. `V1-FR-SUB-008`
Requirement: Cloud sandbox execution environment shall be available only to Pro, Max, and Enterprise tiers. Free and Plus tiers are restricted to local execution profiles (Local Docker / Local Native). Entitlement check for execution environment must run server-side at job creation time, not only client-side.
Priority: P0
Acceptance: Free and Plus job creation requests with `execution_mode: REMOTE_SANDBOX` are rejected with `ENTITLEMENT_DENIED` reason code. Client UI for Free/Plus does not expose cloud execution option. Pro/Max/Enterprise users can select execution environment at job setup.

7. `V1-FR-SUB-007`  
Requirement: Billing must classify charge responsibility between infrastructure failures and logical workflow failures.  
Priority: P0  
Acceptance: Infrastructure-level failures are non-billable; logic-level failures consume normal usage according to policy.

### 9.3 Project and Job Lifecycle
1. `V1-FR-JOB-001`  
Requirement: User can create refactor jobs from selected local workspace targets.  
Priority: P0  
Acceptance: Job is created and visible with owner, status, and timestamps.

2. `V1-FR-JOB-002`  
Requirement: Job ownership checks shall apply to all job-related endpoints.  
Priority: P0  
Acceptance: User A cannot read or mutate User B job resources.

3. `V1-FR-JOB-003`  
Requirement: Workflow status must persist across service restarts.  
Priority: P0  
Acceptance: In-progress jobs resume and status remains consistent after restart.

4. `V1-FR-JOB-004`  
Requirement: System shall run workspace preflight before job start and require explicit handling policy for dirty state.  
Priority: P0  
Acceptance: Preflight result is visible to user and user selects continue/cancel workflow policy explicitly.

5. `V1-FR-JOB-005`  
Requirement: Refactor execution shall default to non-destructive workspace mode.  
Priority: P0  
Acceptance: Generated changes are staged as artifact/patch first, instead of direct irreversible overwrite.

6. `V1-FR-JOB-006`  
Requirement: Patch application shall require base-hash validation against job-start file hash snapshot.  
Priority: P0  
Acceptance: If hash mismatch is detected, patch apply is blocked and user receives explicit conflict prompt.

7. `V1-FR-JOB-007`  
Requirement: IDE-attached local-execution jobs must maintain client heartbeat with control plane; heartbeat loss must enter a transient disconnect grace path with immediate cloud token-generation pause and a `300s` recovery window before orphan classification.  
Priority: P0  
Acceptance: Transient disconnects inside grace window do not force terminal orphan state; unrecovered disconnect beyond grace window triggers deterministic orphan handling with machine-readable disconnect reason and no continued token burn.
Acceptance Addendum: IDE extension must display real-time grace-period countdown UI (`Reconnecting... Job paused. Resuming in Xs.`) from first heartbeat-loss detection until recovery or grace expiry. A `Force Terminate Job` action must be available during grace period.

### 9.4 Proposal, BDD, and SDD
1. `V1-FR-SPEC-001`  
Requirement: System shall return exactly 3 proposal levels: Conservative (lowest risk), Standard, and Comprehensive (deepest refactor). Names must explicitly decouple from billing tier terminology.  
Priority: P0  
Acceptance: Proposal payload includes all three levels with structured fields.

2. `V1-FR-SPEC-002`  
Requirement: BDD and SDD must be editable through natural language interactions in IDE.  
Priority: P0  
Acceptance: User edits plain-language statements and system updates structured spec records.

3. `V1-FR-SPEC-003`  
Requirement: BDD and SDD revisions shall be persisted with version history.  
Priority: P0  
Acceptance: Every update is traceable with actor, timestamp, and revision id.

4. `V1-FR-SPEC-004`  
Requirement: Segment A users shall receive guided BDD-first mode with optional SDD visibility.  
Priority: P1  
Acceptance: Beginner mode hides low-level architecture details by default.

5. `V1-FR-SPEC-005`  
Requirement: Segment B (Technical) users shall have access to an `Expert Fast-Track` toggle. When enabled for bounded scopes (for example single function or single file), workflow bypasses manual spec approval and uses implicit LLM-generated specs to immediately trigger test and refactor loop. These implicit specs must still be persisted, version-stamped, and visible in job detail and fallback views for auditability.  
Priority: P1  
Acceptance: Fast-Track jobs show persisted implicit spec in job detail panel; fallback view surfaces the same spec version used at execution start.
Note: Expert Fast-Track does NOT bypass mandatory baseline validation (`V1-FR-TEST-002`). Fast-Track bypasses manual spec approval only; baseline gate and self-healing retry loop remain mandatory.

### 9.4A Segment A Guided Mode Requirements (Simple Mode)
1. `V1-FR-UXA-001`  
Requirement: For Segment A users, execution profile selection (`Local Docker` vs `Local Native`) must present human-readable risk descriptions, with one recommended default visually pre-selected.  
Priority: P1  
Acceptance: Segment A onboarding does not present Docker/Native as equivalent neutral options; recommended option is clearly emphasized.

2. `V1-FR-UXA-002`  
Requirement: For Segment A users, preflight dirty-state prompt must expose only simplified choices (`Continue (safe mode)` and `Cancel`) without raw VCS status output or git terminology.  
Priority: P1  
Acceptance: Segment A dirty-state prompt contains no raw git output or low-level VCS terms.

3. `V1-FR-UXA-003`
Requirement: For Segment A users, strategy proposal view must default to plain-language impact summary; technical risk score/depth details must be behind optional expand/collapse controls.
Priority: P1
Acceptance: Segment A proposal screen passes plain-language readability checks with no unexplained technical terms above the fold.

### 9.4B Professional Mode Requirements

1. `V1-FR-PRO-001`
Requirement: Professional Mode (available to Pro/Max/Enterprise tiers) shall provide technical analysis emphasis in the strategy proposal phase, including: comparative performance characteristics (for example memory profile, startup time, GC behavior), breaking change surface area, dependency compatibility matrix, and estimated migration complexity score.
Priority: P1
Acceptance: Professional Mode proposal cards include at least one technical metric per strategy option not present in Simple Mode proposals.

2. `V1-FR-PRO-002`
Requirement: For Enterprise accounts, the analysis phase shall produce a structured `Enterprise Analysis Report` as a standalone deliverable artifact in addition to the strategy proposals. This report is designed to be presented to technical management and must include:
   - Technical debt quantification: estimated hours of maintenance burden in current state (based on code complexity metrics).
   - Refactoring ROI projection: estimated reduction in maintenance hours per quarter post-refactoring.
   - Risk-adjusted modernization timeline: estimated calendar duration for full refactoring at each strategy level.
   - Dependency risk assessment: third-party libraries at end-of-life or with known security debt.
   - "Management summary" section: plain-language executive summary suitable for non-technical stakeholders.
Priority: P1
Acceptance: Enterprise account jobs produce a downloadable/shareable `enterprise_analysis_report` artifact (PDF and JSON formats) before strategy selection proceeds. Report is accessible in job detail view and via API.

3. `V1-FR-PRO-003`
Requirement: Enterprise trial accounts (provisioned by IAMA operator after direct contact) shall have access to the full analysis phase including Enterprise Analysis Report, but workflow shall pause at strategy selection and require upgrade to full Enterprise account before refactoring execution can proceed.
Priority: P1
Acceptance: Trial accounts see a clear "Upgrade to continue" gate after analysis report delivery. Trial-generated analysis reports remain accessible for 14 days.

### 9.5 Test, Baseline, and Self-Healing
1. `V1-FR-TEST-001`  
Requirement: System shall generate tests from approved specs before refactoring.  
Priority: P0  
Acceptance: Test artifact exists and is linked to current approved spec revision.

2. `V1-FR-TEST-002`  
Requirement: Baseline validation on legacy code is mandatory before entering refactor loop.  
Priority: P0  
Acceptance: Baseline must pass through approved baseline mode before direct refactor starts.

3. `V1-FR-TEST-003`
Requirement: Self-healing loop shall detect repeated identical failure patterns. If the same test(s) fail with the same root error signature for 3 consecutive repair attempts, the system must pause and present the user with two explicit choices: `Intervene` or `Deep Fix`. Standard repair loop does not blindly continue after 3 identical failures.
Priority: P0
Acceptance: Failure pattern fingerprint (test names + error class + failure location) is tracked per attempt. Identical-pattern threshold of 3 triggers mandatory intervention prompt. User can dismiss and allow continued standard repair (up to a configurable total retry ceiling, default 10 total attempts across all phases). If user does not respond within escalation confirmation timeout, system applies pre-authorized policy or transitions to `FALLBACK_REQUIRED`.

3A. `V1-FR-TEST-003A`
Requirement: Deep Fix mode shall perform a full context purge and first-principles re-analysis. When user selects Deep Fix: (1) current LLM context for the failing function/module is cleared; (2) system re-reads original legacy source for the failing scope and the corresponding test; (3) LLM is prompted from scratch using only original code, original test, and target refactoring spec — no prior repair attempt history in context; (4) for Max/Enterprise users, system presents the L3 confirmation gate (identical to the gate defined in V1-FR-ROUTE-002 and V1-FR-SUB-003: a dialog shows estimated L3 cost as % of remaining monthly balance with the message "Deep Fix will activate the highest-tier reasoning model. Estimated consumption: approximately 15–40% of your remaining monthly balance. This operation cannot be cancelled once started. Proceed?") — user must explicitly confirm before L3 dispatches; L3 never dispatches for Deep Fix without this confirmation; Pro users may select Deep Fix but receive L2 escalation only (L3 is not available to Pro tier); (5) after Deep Fix generates a new patch, standard test-and-repair loop resumes with a fresh attempt counter.
Priority: P0
Acceptance: For Max/Enterprise users: L3 confirmation dialog (same as V1-FR-ROUTE-002 gate) is mandatory before Deep Fix dispatches; no L3 call occurs without explicit confirmation. Deep Fix cycle shows `[Deep Fix active — context reset — model upgraded to L3]` indicator in execution console after confirmation is received. After Deep Fix patch is applied, attempt counter resets to 0. Free and Plus users see Deep Fix option but do not receive model upgrade; they may manually trigger a model upgrade using advanced quota. Pro users may select Deep Fix and receive L2 escalation only; no L3 confirmation dialog is shown to Pro tier.

4. `V1-FR-TEST-004`
Requirement: Failed test outputs must be preserved and visible to user in fallback stage.
Priority: P0
Acceptance: Failure report includes test names, error excerpts, failure pattern fingerprint, number of identical-pattern failures, and last attempted patch summary.

5. `V1-FR-TEST-005`  
Requirement: Baseline validation shall support two approved paths: assertion-based baseline and characterization/snapshot baseline; if baseline still fails, system must provide explicit `Quarantine / Mock Overrides` controls for technical users before refactor-loop entry.  
Priority: P0  
Acceptance: Workflow can proceed if one approved baseline path passes policy checks, or user explicitly resolves blocker through approved quarantine/mock-override policy path with audit trail.

6. `V1-FR-TEST-006`  
Requirement: Characterization baseline mode shall persist legacy input/output artifacts for traceability.  
Priority: P0  
Acceptance: Snapshot artifacts are versioned and linked to job and spec revision.

7. `V1-FR-TEST-007`  
Requirement: UI must clearly indicate which baseline mode passed for a job.  
Priority: P1  
Acceptance: Delivery/fallback surfaces display baseline mode and associated risk note.

8. `V1-FR-TEST-008`  
Requirement: Test failures caused by execution timeout must be classified as `TIMEOUT_EXECUTION`, distinct from `LOGIC_FAILURE`, and must follow timeout-specific recovery policy.  
Priority: P0  
Acceptance: Timeout events are explicitly classified and do not silently consume full retry budget under logic-failure policy.

9. `V1-FR-TEST-009`
Scope constraint: In V1.0, Black-Box Orchestration mode applies only to same-ecosystem jobs where AST parser confidence score falls below policy threshold (default: 40%). Cross-ecosystem language pairs (for example COBOL→Java, Delphi→Python) are explicitly out of scope for V1.0 and are designated as V1.x experimental features. Cross-ecosystem support is governed by the approved source language matrix managed via `V1-FR-OPS-001` dynamic config store.

Requirement: System supports `Black-Box Orchestration` baseline mode that generates target-language orchestration tests (for example Python or TypeScript) against CLI invocation, HTTP interface, or DB-state comparison instead of direct AST-level unit binding. In V1.0, this mode is used only for same-ecosystem jobs with low AST parser confidence. Users may manually override baseline mode selection from the baseline strategy screen.
Priority: P1
Acceptance: Baseline workflow can execute orchestration tests against legacy interfaces, snapshot outputs, and replay same tests against refactored target for behavioral validation in same-ecosystem jobs. Mode selection and trigger reason (auto/manual/low-ast-confidence) are visible in job detail.

When Black-Box Orchestration mode is active (auto-triggered or manually selected), the test review screen must display:
1. AST confidence score (0??00%) with trigger reason: `auto-detected low confidence` / `cross-ecosystem language pair detected` / `manual user selection`.
2. Identified business behaviour count (LLM-estimated) vs test-covered behaviour count.
3. List of behaviours flagged as potentially uncovered, with per-item LLM confidence level.
4. User may proceed without covering all flagged behaviours, but must explicitly acknowledge: "I understand [N] behaviours may not be covered by generated tests. I accept this risk and wish to proceed."
5. Acknowledgement action is audit-logged with: timestamp, user identity, uncovered behaviour count, and AST confidence score at time of acknowledgement.

Note: Existing BDD/SDD editing and test add/delete mechanisms are sufficient for the actual review action. No additional mandatory human review gate is required beyond this acknowledgement flow.

### 9.6 Sandbox and Safety
1. `V1-FR-SBX-001`  
Requirement: Test execution shall use a selectable local execution profile: `Local Docker` (preferred isolation) or `Local Native` (compatibility fallback).  
Priority: P0  
Acceptance: User can select profile in onboarding and extension settings, with explicit risk labels.

2. `V1-FR-SBX-002`  
Requirement: Sandbox output paths must be separated from source paths.  
Priority: P0  
Acceptance: Input source is not mutated by sandbox execution stage.

3. `V1-FR-SBX-003`  
Requirement: If Docker is unavailable or blocked, system shall degrade gracefully to approved local-native mode instead of hard failing job start.  
Priority: P0  
Acceptance: Docker-not-installed path remains usable and policy-compliant.

4. `V1-FR-SBX-004`  
Requirement: `Local Native` execution shall run tests in isolated child process with enforced timeout and forced termination on timeout.  
Priority: P0  
Acceptance: Timeout is treated as test failure and workflow enters self-healing path.

5. `V1-FR-SBX-005`  
Requirement: Native execution timeout must be configurable in VS Code settings with default value `30 seconds`.  
Priority: P0  
Acceptance: Default timeout is 30 seconds; user can change value within policy-defined bounds.

6. `V1-FR-SBX-006`
Requirement: Local Native mode shall require explicit side-effect warning acknowledgement before first execution AND must verify that the workspace has a clean VCS checkpoint before executing any destructive test or patch operation.
Priority: P0
Acceptance:
- User must confirm warning about possible real-world side effects (for example filesystem or database writes) before running Native mode.
- Before executing any write or test phase, system must detect VCS state: if a Git repository is present, it must have either a clean working tree, a stash entry, or a committed state relative to HEAD. If none of these conditions are met, execution must be blocked with a machine-readable error `LOCAL_NATIVE_NO_VCS_CHECKPOINT` and the user must be directed to commit or stash their changes first.
- If no Git repository is detected at all in the workspace, system must display an elevated-severity warning ("No version control detected — IAMA cannot guarantee workspace recovery if execution fails") and require a second explicit confirmation before proceeding.
- These VCS checks apply per-job and must be re-validated if the user resumes a job after leaving and re-entering Native mode.

7. `V1-FR-SBX-007`  
Requirement: Timeout recovery path must provide explicit continuation choices (`increase_timeout`, `skip_or_quarantine_test`, `continue_repair`) before exhausting retry budget by default.  
Priority: P1  
Acceptance: Timeout branch pauses for deterministic user/policy decision instead of blindly consuming all retries.

### 9.7 Delivery and Fallback
1. `V1-FR-DEL-001`  
Requirement: Successful jobs shall provide diff-centric delivery experience in IDE.  
Priority: P0  
Acceptance: User can inspect file-level changes before accepting.

2. `V1-FR-DEL-002`
Requirement: When the identical-failure threshold (V1-FR-TEST-003) is triggered, or when the total retry budget is exhausted, the system shall present a structured decision panel with evidence surface, not a free-form chat interface.
Priority: P0
Acceptance: Fallback/intervention UI contains failure evidence and the following interaction modes:
- Required evidence surface: failed test names, error excerpts, and last attempted patch summary.
- Recovery action buttons (explicit labels): `Retry with higher model` | `Edit spec` | `Download partial artifact` | `Report issue`.
- Optional natural-language field: single-line inline input for spec clarification only, rendered inline and not as a chat thread.

3. `V1-FR-DEL-003`  
Requirement: On `FAILED` or `FALLBACK_REQUIRED`, system shall guarantee recoverable workspace state with patch artifact retention.  
Priority: P0  
Acceptance: User can restore pre-job state and still inspect generated patch artifacts.

4. `V1-FR-DEL-004`  
Requirement: Delivery patch application must be pruning-resilient: edit generation must use AST-aware symbolic edits or exact search-replace blocks, and server must reconstruct final diff from full target files rather than line-number-only output from pruned prompts.  
Priority: P0  
Acceptance: Patch apply succeeds against full source with stable base-hash validation and without line-number drift caused by context pruning.

5. `V1-FR-DEL-005`  
Requirement: Delivery diff view must support partial acceptance at file-level or hunk-level. For AST-symbolic edit jobs, partial selection operates at file level; hunk-level selection applies only when a unified diff representation is available for delivery artifact. Unselected hunks or files are excluded from apply and retained as partial artifact accessible from job detail view.  
Priority: P1  
Acceptance: User can select individual files or hunks for acceptance; unselected portions are excluded from patch apply and retained as partial artifact in job detail.

6. `V1-FR-DEL-006`  
Requirement: For Segment A (Non-technical) users, if system detects high-complexity logic changes in delivery diff (for example control-flow modifications or external dependency changes), delivery flow must enforce a `Complexity Warning` screen requiring explicit delayed confirmation (for example user must acknowledge plain-language summary) before apply proceeds. This requirement applies within V1 single-user context; peer review delegation is deferred to V2 team features.  
Priority: P1  
Acceptance: Segment A users encountering flagged high-complexity diffs must complete a secondary confirmation screen before apply proceeds; confirmation action is audit-logged with timestamp and user identity.

7. `V1-FR-DEL-007`  
Requirement: System must provide `Revert Job` action for successfully delivered jobs, using reverse-patch application. Revert is valid only within same working-tree session where apply occurred. If user has committed delivered changes to VCS after apply, system must block automated revert, surface explicit warning, and provide original reverse-patch artifact for manual application. All revert or revert-blocked actions must produce audit trail.  
Priority: P1  
Acceptance: Revert action is available in delivery and job detail view; if post-commit VCS state is detected, revert action is replaced by `Download Reverse Patch` with explicit warning; all outcomes are audit-logged.

8. `V1-FR-DEL-008`  
Requirement: Job detail view must display artifact expiry date/time for all completed and failed jobs subject to retention TTL policy.  
Priority: P1  
Acceptance: User can see explicit expiry timestamp next to each artifact; system sends email reminder 48 hours before expiry for jobs that produced billable artifacts.

### 9.8 Audit and Observability
1. `V1-FR-OBS-001`  
Requirement: All critical workflow transitions must emit structured audit events.  
Priority: P0  
Acceptance: Events include actor, job_id, old_state, new_state, timestamp.

2. `V1-FR-OBS-002`  
Requirement: Live logs shall be available via authenticated stream endpoint.  
Priority: P0  
Acceptance: Only authorized user receives real-time events for owned jobs.

3. `V1-FR-OBS-003`  
Requirement: Long-running generation and retry stages shall expose mandatory streaming logs including stage, model route, and failure summaries.  
Priority: P0  
Acceptance: Users can monitor progress in real time without blind waiting periods.

### 9.9 Context and Resource Guardrails
1. `V1-FR-CTX-001`  
Requirement: IDE context builder shall include dependency-aware expansion with AST-derived interface/type contents.  
Priority: P0  
Acceptance: Context package includes required dependency interface slices, not only file path manifests.

2. `V1-FR-CTX-002`  
Requirement: Context assembly shall prioritize semantic dependencies over raw file-size ordering.  
Priority: P0  
Acceptance: Missing critical interface/type dependencies is treated as validation failure.

3. `V1-FR-CTX-003`  
Requirement: Context builder must produce explainable context manifest for each model request.  
Priority: P1  
Acceptance: Job metadata includes selected slices and inclusion reasons.

4. `V1-FR-CTX-004`  
Requirement: If context size exceeds plan cap, backend shall run AST-based pruning that removes non-critical implementation bodies while preserving interface signatures and approved spec context; files selected as direct refactor targets must remain unpruned.  
Priority: P0  
Acceptance: Pruned request remains schema-valid and traceable with pruning report, while target-file content used for edit generation remains complete.

5. `V1-FR-CTX-005`  
Requirement: If request still exceeds cap after pruning, system must fail fast and block provider call.  
Priority: P0  
Acceptance: UI receives actionable message instructing user to narrow selection scope.

6. `V1-FR-CTX-006`
Requirement: LLM proxy shall implement mandatory prompt caching for stable context segments to reduce repeated token cost across retry loops. Prompt caching is system-enforced and is NOT user-configurable.

Mandatory caching implementation:
- Cache tier 1 (TTL: 1 hour): System prompt + project dependency interfaces (AST-derived, stable across retries). Cache write occurs on job start.
- Cache tier 2 (TTL: 5 minutes, refreshed per retry): Approved BDD/SDD spec + test spec. Cache write occurs after spec approval.
- Fresh segment (never cached): Per-retry error output, new patch attempt context, user edits within current retry.

Rules:
1. Minimum content size for caching: 1,024 tokens.
2. Cache hit/miss must be recorded in usage telemetry per call.
3. Expected outcome: retry calls 2? in self-healing loop cost approximately 10% of cold-start input cost for stable segments (using provider cache-read rate).

Priority: P0
Acceptance: Cacheable context segments are reused across retry attempts. Cache hit/miss is recorded in usage telemetry per call. Credit consumption for cache-read events uses cache-read rate (??0% of standard input rate), not standard input rate.

7. `V1-FR-CTX-007`  
Requirement: Context builder must enforce strict file-type allowlists and line-length/entropy heuristics to reject binary files, compiled assets, and minified bundles before AST parsing or token counting.  
Priority: P0  
Acceptance: Rejected files are excluded with machine-readable reason codes and user-facing guidance before context packaging.

### 9.10 Billing, Quota, and Cost Defense

**Credit System Definition:**

1 Credit (C) = $0.01 USD of actual API cost.

Credits are consumed dynamically based on real token usage:
`Formula: (input_tokens ? input_price + output_tokens ? output_price) / $0.01 = credits consumed`

Prompt cache reads consume credits at the cache-read rate (approximately 10% of standard input rate). All model tiers (L1/L2/L3) consume credits based on actual cost. Credits are a backend accounting unit only ??they are **not** surfaced as raw numbers in user-facing UI (see `V1-FR-SUB-003` for display policy). Enterprise tier billing portal is the sole exception where actual dollar amounts are displayed.

**Quota Enforcement ??Two-Layer System:**

Layer 1 ??Monthly Credits (financial ceiling):
- Resets on billing cycle anniversary.
- Reaching zero blocks new job creation with `INSUFFICIENT_MONTHLY_BALANCE` code.
- In-flight jobs **always** run to completion regardless of monthly credit status.
- New job creation is blocked when monthly credits = 0.

Layer 2 ??Daily Job Count (anti-burst protection):
- Resets at midnight UTC daily.
- Unused daily job slots do NOT roll over to next day.
- Weekly cap is not implemented in V1 (reserved for V2+ based on abuse data).

Job start gate (both conditions must pass for paid tiers):
- Condition 1: today's started job count < daily job limit.
- Condition 2: remaining monthly credits ??10C (minimum start threshold).
- Exception: Free tier uses daily job count only; monthly credit check (Condition 2) does not apply to Free tier.

If either condition fails: job creation is blocked with machine-readable reason code (`DAILY_JOB_LIMIT_REACHED` or `INSUFFICIENT_MONTHLY_BALANCE`), both including estimated reset time in the response.

Add-on credit behavior:
- Add-on credits add to monthly total only.
- Daily job limit scales proportionally: +25% monthly add-on ??daily job limit ? 1.25 (rounded up).
- Add-on is valid for the current billing cycle only; does not carry over.
- Plus tier: add-on purchase is NOT available. Users are directed to upgrade to Pro.

1. `V1-FR-BIL-001`  
Requirement: Billing ledger shall record machine-readable failure class for each run, including at minimum `INFRA_FAILURE`, `LOGIC_FAILURE`, `USER_CANCELLED`, `POLICY_BLOCKED`, `TIMEOUT_EXECUTION`, and `CLIENT_DISCONNECTED`.  
Priority: P0  
Acceptance: Charge/no-charge decisions are auditable per job attempt.

2. `V1-FR-BIL-002`  
Requirement: Infrastructure failures shall not consume paid quota; logic failures and normal retries shall consume quota according to plan policy.  
Priority: P0  
Acceptance: Reconciliation reports show zero charge for infra-failure attempts.

3. `V1-FR-BIL-003`  
Requirement: Plan policy must support advanced quota exhaustion behavior (`degrade_to_base_model` or `buy_addon`) per tier.  
Priority: P0  
Acceptance: User sees deterministic action path when advanced quota reaches zero.

4. `V1-FR-BIL-004`  
Requirement: System must enforce optimistic quota reservation with distributed locking before a job can transition into `ANALYZING`; reserved quota must be atomically committed or released based on terminal charge policy.  
Priority: P0  
Acceptance: Concurrent multi-session starts cannot double-spend quota, and released reservations are traceable.

5. `V1-FR-BIL-005`  
Requirement: Billing ledger failure classes must include `TIMEOUT_EXECUTION` and `CLIENT_DISCONNECTED`, with explicit charge policy per class.  
Priority: P0  
Acceptance: Ledger and reconciliation clearly show charge/no-charge behavior for timeout and disconnect scenarios.

6. `V1-FR-BIL-006`  
Requirement: Quota point-of-no-return must be state-defined: disconnect before `GENERATING_TESTS` releases advanced-run reservation; disconnect at/after `GENERATING_TESTS` commits chargeable reservation while preserving job artifact retrieval by `job_id`.  
Priority: P0  
Acceptance: State-based charging is deterministic, abuse-resistant, and reconnect users can still retrieve outputs/evidence from the same charged run.

### 9.11 Model Routing and Agentic Waterfall
1. `V1-FR-ROUTE-001`  
Requirement: IDE client shall submit standardized OpenAI-compatible JSON request shape; cloud LLM proxy shall perform protocol translation for provider-specific formats.  
Priority: P0  
Acceptance: Frontend request contract remains stable while backend routes to multiple model providers.

2. `V1-FR-ROUTE-002`
Requirement: Model routing shall be entitlement-aware and user-preference-aware by stage (`planning`, `test_generation`, `refactor`, `repair`). The following model class definitions are authoritative:

**L1 ??Low-cost generation model** (e.g., MiniMax M2.5 Standard or equivalent multi-vendor low-cost class):
- Mandatory for: `test_generation` stage (ALL tiers), `refactor_generation` stage (ALL tiers).
- Handles all high-output generation tasks (full file output 10K??5K tokens) at minimal cost.
- Output cap: 30,000 tokens hard limit per L1 call.
- Rate limit: max 3 concurrent L1 calls per user session.
- Available tiers: All (Free, Plus, Pro, Max, Enterprise).

**L2 ??Advanced model** (e.g., Claude Sonnet 4.6 or GPT Codex-class):
- Used for: `repair` stage (self-healing iterations 4??), fallback conversation, BDD/SDD natural language interpretation when L1 confidence is insufficient.
- Output constraint: `patch_edit_schema` format ONLY; 5,000 token hard output cap per L2 call. Full file regeneration is PROHIBITED.
- Available tiers: Plus, Pro, Max, Enterprise.

**L3 ??Premium model** (e.g., Claude Opus 4.6):
- Used for: Deep Fix mode only (context-reset full re-derivation after L2 exhausts retry budget).
- Output constraint: `patch_edit_schema` format ONLY; 5,000 token hard output cap per L3 call. Full file regeneration is PROHIBITED.
- Confirmation required: Each L3 call requires explicit user confirmation showing estimated cost as % of remaining monthly balance (see `V1-FR-SUB-003`).
- Available tiers: Max, Enterprise only.

> **[AGENT OVERRIDE DIRECTIVE ??ADR-002 Amendment]** L1 is officially designated as a **multi-vendor low-cost model class** (e.g., MiniMax M2.5 Standard or equivalent), overriding any previous Anthropic-only (Claude-Haiku) limitation. Route table is managed server-side via `V1-FR-OPS-001` dynamic config.

Priority: P0
Acceptance: Routing decisions are logged with tier, stage, selected model class, and reason. L2 output exceeding 5,000 tokens triggers controlled retry with explicit schema constraint reinforcement. L3 calls are blocked without preceding user confirmation.

3. `V1-FR-ROUTE-003`
Requirement: Retry pipeline shall use a cascade routing policy:

| Stage | Iterations | Model Class |
|-------|-----------|-------------|
| `test_generation` | Always | L1 |
| `refactor_generation` | Always | L1 |
| `repair` iterations 1?? | All tiers | L1 |
| `repair` iterations 4?? | Plus and above | L2 |
| `repair` iterations 7?? | Max and above | L2 escalation or L3 |
| `fallback_conversation` | Plus+: L2 minimum; Free: L1 | |

**Precedence rule**: The 3-consecutive-identical-failure rule (`WAITING_INTERVENTION` trigger from `V1-FR-TEST-003`) takes precedence over iteration-based model escalation. If 3 identical failures occur before iteration 4, `WAITING_INTERVENTION` is triggered regardless of model tier. Iteration-based L2 escalation only applies when failures are non-identical.

Pre-authorization: Phases 2 and 3 (L2/L3) support pre-authorized escalation at job start; without pre-authorization, explicit user confirmation is required before escalation.

Escalation timeout: When awaiting explicit escalation confirmation, system must enforce a confirmation timeout (default `3600s`, configurable in job settings). On timeout: if job-start pre-authorization is present, apply pre-authorized policy without confirmation; if no pre-authorization exists, transition to `FAILED` with reason `ESCALATION_CONFIRMATION_TIMEOUT`. System must never wait indefinitely.
Priority: P0
Acceptance: Phase transitions are auditable, respect plan entitlements, and execute non-blocking escalation when valid pre-authorization is present. Escalation confirmation timeout is enforced; no indefinite wait states exist.

4. `V1-FR-ROUTE-004`  
Requirement: Default routing table may include provider/model aliases (for example MiniMax M2.5, Claude Sonnet-class, GPT Codex-class, Claude Opus-class) but must remain policy-versioned and configurable server-side.  
Priority: P1  
Acceptance: Model version updates do not require client release.

5. `V1-FR-ROUTE-005`
Requirement: Phase access is gated by tier entitlement as defined in `V1-FR-SUB-004`. Specifically:
- Free: Phase 1 only. Phase 2 escalation prompt is never shown.
- Plus: Phase 1 and Phase 2 (up to monthly quota). Phase 3 escalation is blocked.
- Pro: Phase 1 and Phase 2. Phase 3 escalation is blocked.
- Max: Phase 1, Phase 2, and Phase 3. Fast-track to Phase 3 available (see V1-FR-ROUTE-006).
- Enterprise: All phases. Phase escalation may be pre-authorized at job start.
Priority: P0
Acceptance: Unauthorized phase escalation is blocked at the proxy layer with `ENTITLEMENT_DENIED_PHASE` machine-readable reason. Tier-appropriate escalation options are the only ones surfaced in UI.

6. `V1-FR-ROUTE-006`
Requirement: Max-tier shall have optional fast-track switch to skip Phase 2 and use Phase 3 (premium) directly as rescue route when Phase 2 has already failed. This consumes Phase 3 quota.
Priority: P1
Acceptance: Fast-track option only appears after Phase 2 failure. Usage is explicitly logged and quota impact is shown before confirmation.

### 9.12 Payment and Billing Automation Foundation
1. `V1-FR-PAY-001`  
Requirement: System shall integrate a production payment gateway (for example Stripe or LemonSqueezy) as the billing source of truth.  
Priority: P0  
Acceptance: Subscription lifecycle state is synchronized from gateway events.

2. `V1-FR-PAY-002`  
Requirement: Backend shall expose webhook listeners for payment lifecycle events, including successful payment, failed payment, and subscription cancellation.  
Priority: P0  
Acceptance: Payment success grants quota; payment failure/cancellation enforces plan downgrade or premium lock according to policy.

3. `V1-FR-PAY-003`  
Requirement: Backend shall run monthly quota refresh jobs aligned to billing cycle boundaries.  
Priority: P0  
Acceptance: Pro/Max advanced quotas reset automatically per billing cycle and produce auditable records.

4. `V1-FR-PAY-004`  
Requirement: Metered overage reporting API shall exist for plans allowing extra quota purchase.  
Priority: P0  
Acceptance: Additional usage can be reported to payment gateway and appears in billing breakdown.

5. `V1-FR-PAY-005`  
Requirement: Web frontend shall provide checkout redirection and customer portal access for invoice download, card update, and subscription cancellation.  
Priority: P0  
Acceptance: Users can self-serve billing actions without manual support intervention.

6. `V1-FR-PAY-006`  
Requirement: IDE shall show usage watermark alerts at 80% and 100% of advanced quota, with upgrade/add-on action links.  
Priority: P1  
Acceptance: Toast alerts trigger deterministically at threshold crossing.

### 9.13 Admin and Operator Console
1. `V1-FR-OPS-001`  
Requirement: System shall provide dynamic configuration store APIs for model routing, feature flags, and operational toggles without redeploy.  
Priority: P1  
Acceptance: Authorized operators can update active routing/config values through audited API calls.
> [IMPLEMENTATION NOTE]
> Consider LaunchDarkly or Unleash (self-hosted) for dynamic config store.
> Both provide audit log, role-based access, and gradual rollout without custom implementation.

2. `V1-FR-OPS-002`  
Requirement: System shall provide global and per-user kill switch APIs for blocking new job creation while preserving in-flight job safety policy.  
Priority: P1  
Acceptance: Kill switch effects are immediate for new jobs and audit-logged.
> [IMPLEMENTATION NOTE]
> Consider LaunchDarkly or Unleash (self-hosted) for kill-switch implementation.
> Both provide audited policy control and rollback primitives suitable for emergency feature gating.

3. `V1-FR-OPS-003`  
Requirement: Admin APIs shall support manual quota refund/deduct operations with reason codes.  
Priority: P1  
Acceptance: Quota adjustments are role-restricted, traceable, and visible in ledger.

4. `V1-FR-OPS-004`  
Requirement: Admin console shall include user 360 view and system health dashboard (cost, error rates, model availability).  
Priority: P1  
Acceptance: Operator can inspect user plan/usage/job outcomes and model-provider health in one console.

### 9.14 Support and Ticketing
1. `V1-FR-SUP-001`  
Requirement: Backend shall integrate at least one ticketing provider API (for example Zendesk, Intercom, or Jira Service Management).  
Priority: P1  
Acceptance: Support tickets can be created programmatically with structured metadata.

2. `V1-FR-SUP-002`  
Requirement: System shall provide one-click issue reporting from IDE when job is `FAILED` or `FALLBACK_REQUIRED`.  
Priority: P1  
Acceptance: Report action opens ticket flow with prefilled job identifiers and status timeline.

3. `V1-FR-SUP-003`  
Requirement: Ticket attachments shall include auto-packed redacted logs and traces for reported job scope.  
Priority: P1  
Acceptance: Sensitive fields are masked before payload leaves IAMA systems.

4. `V1-FR-SUP-004`  
Requirement: UI shall require explicit user consent before sending prompt/error context to support systems.  
Priority: P1  
Acceptance: Consent state is recorded and linked to ticket metadata.

5. `V1-FR-SUP-005`  
Requirement: Enterprise support policy must default to metadata-only ticket payloads (no source code, no AST context, no prompt body) unless org admin explicitly enables contextual sharing.  
Priority: P1  
Acceptance: Enterprise tickets contain state traces and operational metadata by default, with admin override audit when code-context sharing is enabled.

### 9.15 Telemetry and Product Analytics
> [IMPLEMENTATION NOTE]
> PostHog (self-hosted) can satisfy `V1-FR-ANA-001` through `V1-FR-ANA-005`
> and supports `Zero Telemetry Mode` via org-level event suppression policy.
> Evaluate before building custom analytics ingestion/export pipeline.

1. `V1-FR-ANA-001`  
Requirement: Backend shall emit server-side core events for lifecycle analytics (for example `job_started`, `baseline_passed`, `fallback_triggered`, `job_delivered`).  
Priority: P0  
Acceptance: Event stream is queryable by user/job/time and used for KPI dashboards.

2. `V1-FR-ANA-002`  
Requirement: Job completion records shall include duration, total token usage, retry count, and model route summary.  
Priority: P0  
Acceptance: Metrics are available for cohort and cost analysis.

3. `V1-FR-ANA-003`  
Requirement: IDE/Web clients shall emit funnel behavior tracking events for key decisions (proposal choice, BDD dwell/edit behavior, patch accept/reject) using metadata-only payloads. Raw BDD/SDD text, keystroke-level input, AST/source snippets, and prompt body content are prohibited in telemetry payloads.  
Priority: P1  
Acceptance: Product analytics can reconstruct end-to-end conversion funnel.

4. `V1-FR-ANA-004`  
Requirement: Extension uninstall flow shall provide optional exit survey link for churn reason capture.  
Priority: P2  
Acceptance: Uninstall feedback categories are recorded in analytics.

5. `V1-FR-ANA-005`  
Requirement: Enterprise tier must support organization-level (enterprise account scope) `Zero Telemetry Mode` that disables funnel/behavior tracking payloads across IDE and web surfaces.  
Priority: P1  
Acceptance: When enabled, analytics endpoints receive no behavioral/funnel payloads or spec-derived content for that enterprise scope, while mandatory security/audit events remain available.

### 9.16 Security, Privacy, and Notification Foundation
1. `V1-FR-SEC-001`  
Requirement: System shall integrate transactional email service for critical notifications (welcome, payment receipt, quota exhaustion, suspicious login).  
Priority: P0  
Acceptance: Triggered emails are sent and auditable by event type.

2. `V1-FR-SEC-002`  
Requirement: System shall provide account deletion API with cascade deletion of cloud metadata and cache artifacts in compliance with data-erasure obligations.  
Priority: P0  
Acceptance: Deletion execution produces verifiable completion report.

3. `V1-FR-SEC-003`  
Requirement: Secret scanning must run before payload leaves IDE/backend boundary to block high-risk credentials and secret files.  
Priority: P0  
Acceptance: Detected secrets block upload unless user resolves issue under policy.

4. `V1-FR-SEC-004`  
Requirement: Extension shall support global ignore configuration (for example `.iamaignore`) to exclude sensitive files from indexing and payload generation.  
Priority: P0  
Acceptance: Ignored paths are never read by context builder.

5. `V1-FR-SEC-005`  
Requirement: First-run experience shall include explicit data-processing consent and zero-data-training policy disclosure.  
Priority: P0  
Acceptance: User consent is captured before first refactor execution.

## 10. API Contract Requirements
This section defines required contract behavior, not implementation.

1. Auth APIs must support registration, login, OAuth callback handling, and token refresh policy.
2. Job APIs must support create/start/status/list/proposals/spec updates/log stream/delivery/fallback.
3. Usage APIs must support current-cycle summary, per-job usage, and entitlement visibility.
4. Billing APIs must expose current plan and upgrade/downgrade actions.
5. Every response must include stable machine-readable status fields.
6. Contract versioning must be explicit.
7. Breaking response changes require version bump.
8. Usage, entitlement, and billing APIs must return charge-decision reason codes for each attempt.
9. API contract must expose model-route metadata in job logs without exposing provider secrets.
10. Payment webhook APIs, billing portal APIs, and metered usage reporting APIs are mandatory.
11. Admin dynamic-config, kill-switch, and quota-adjustment APIs are mandatory and role-protected.
12. Support ticket submission and redacted artifact packaging APIs are mandatory.
13. Event-tracking ingestion/export APIs must support product KPI computation.
14. API gateway responses must include rate-limit machine-readable metadata and deterministic `RATE_LIMITED` reason codes on `429`.
15. Billing and job-start APIs must support atomic quota reservation/commit/release semantics with idempotency keys.
16. Job/stream contracts must expose heartbeat presence fields (`last_seen_at`, `heartbeat_status`) and deterministic timeout reason codes for orphan handling.
17. Context-related contracts must reject blocked file categories (binary/compiled/minified) before AST/tokenization with stable machine-readable reason codes.
18. Delivery contracts must support pruning-resilient edit operations (AST-aware symbolic edits or exact search-replace blocks) and must not rely on line-number-only unified diff as authoritative apply input.
19. Billing contracts must expose `CLIENT_DISCONNECTED` and `TIMEOUT_EXECUTION` reason classes with explicit charge policy and state checkpoint metadata.
20. Support contracts for enterprise tier must default to metadata-only payload mode unless administrator override is explicitly enabled and audited.
21. Auth/stream contracts must support seamless token refresh and stream-resume semantics for long-lived Server-Sent Events (SSE) sessions, preventing UI-visible auth interruption for valid sessions.
22. Telemetry contracts must enforce metadata-only payloads and support enterprise `Zero Telemetry Mode` policy enforcement.
23. Routing contracts must support job-start escalation pre-authorization parameters (phase ceiling and budget policy) so eligible jobs can proceed through advanced phases without runtime confirmation blocking.
24. Heartbeat/orphan contracts must expose grace-period status (`paused`, `grace_deadline_at`) and deterministic terminal transition semantics after grace expiry.

## 11. LLM Output Contract Requirements

**Output token hard caps (operator-configurable via `model.l1.output_token_limit` / `model.l2.output_token_limit` / `model.l3.output_token_limit` in dynamic config; see `DB_SCHEMA.md` Section 8.1; defaults below; enforced by system prompt AND post-generation validation):**

> **Note on L1 output cap**: The default of 30,000 tokens is set to accommodate large-file refactors and full test-suite generation. Modern L1-class models (e.g. MiniMax M2.5, GPT-4o-mini) handle outputs of this length reliably via streaming. IAMA Router **must** use streaming (`stream: true`) for all L1 calls to avoid HTTP gateway timeouts; the post-generation token cap validation applies to the accumulated streamed content. Operators may raise or lower this cap via admin config without redeploy; changes take effect on the next job creation.

| Model class | Stage | Default max output tokens | Format constraint |
|-------------|-------|--------------------------|------------------|
| L1 | `test_generation`, `refactor_generation` | 30,000 | Full file output permitted |
| L2 | `repair` | 5,000 | `patch_edit_schema` ONLY ??full file regeneration PROHIBITED |
| L3 | Deep Fix | 5,000 | `patch_edit_schema` ONLY ??full file regeneration PROHIBITED |

If repair requires changes exceeding `patch_edit_schema` capacity: system must split into multiple sequential patch calls; output limit must not be expanded; each patch call is a separate credit-consuming event.

If model response violates output cap: trigger controlled retry with explicit schema constraint reinforcement in system prompt; log violation as `model_output_policy_violation` event.

1. All model-facing stages must use strict JSON output contracts.
2. Every stage must define schema version and required fields.
3. Invalid schema output must trigger controlled retry path.
4. Prompt templates must include:
   1. Safety rules.
   2. Output schema constraints.
   3. Role-specific behavior controls (A/B/Enterprise modes).
5. Provider responses must be normalized before entering workflow.
6. LLM proxy shall enforce provider-native structured output controls when available.
7. LLM proxy shall include tolerant JSON parsing and controlled repair pass before hard schema failure.
8. If repair fails, system must fail closed with machine-readable error and audit event.
9. LLM proxy shall enforce plan-level token budget checks before provider call.
10. LLM proxy shall apply AST pruning policy before rejecting oversized requests.
11. Prompt caching shall be supported for stable context segments, with cache policy and telemetry.
12. Pre-AST filtering must run file-type allowlist and line-length/entropy heuristics to block binary/minified/compiled content from entering model context.
13. Target files selected for direct refactor must remain unpruned during model edit generation; pruning applies only to dependency/context files.
14. Patch output must use pruning-resilient edit instructions (AST-aware symbolic edits or exact search-replace blocks), and each edit operation must include stable apply anchors (for example AST node identifier or exact search-block fingerprint) plus expected base fingerprint; line-number-only unified diff cannot be apply authority.
15. Final delivery diff must be reconstructed from full source after edit application, then validated against base-hash constraints.

Required schema families:
1. `proposal_schema`.
2. `bdd_schema`.
3. `sdd_schema`.
4. `test_plan_schema`.
5. `patch_plan_schema`.
6. `failure_analysis_schema`.
7. `patch_edit_schema`.

## 12. Database Logical Design Requirements
Minimum logical entities:
1. User.
2. SubscriptionTier.
3. UsageLedger.
4. Project.
5. RefactorJob.
6. JobArtifact.
7. BDDItem.
8. SDDItem.
9. SpecRevision.
10. TestRun.
11. PatchAttempt.
12. AuditEvent.
13. PaymentSubscription.
14. DynamicConfig.
15. SupportTicketLog.
16. QuotaReservation.
17. ClientHeartbeatSession.
18. PatchEditOperation.

Mandatory design constraints:
1. Every job row must map to one owner user_id.
2. Every BDD/SDD item must map to job_id and revision_id.
3. Every test run must map to a spec revision and attempt number.
4. Failure reports must be queryable for fallback UI.
5. Payment webhook processing must be idempotent and traceable to subscription state transitions and quota changes.
6. Dynamic config changes must record actor identity, effective scope, and timestamp for auditability.
7. Support ticket records must map to `job_id`, `user_id`, and external ticket identifier.
8. Code-bearing artifacts/log snapshots persisted in cloud storage must be encrypted at rest with managed key references and auditable key-usage metadata.
9. Quota reservations must support idempotent create/commit/release semantics and conflict-safe locking metadata for concurrent requests.
10. Code-bearing artifacts/logs must store retention metadata (`expires_at`, `retention_policy_version`) for automated hard-delete workflows.
11. Heartbeat sessions must bind to job/workflow context and persist last-seen timestamp and timeout policy version.
12. Patch edit operations must persist target file fingerprint, edit-operation type, and apply outcome for reconciliation and auditability.

## 13. Workflow State Machine Requirements
Required states:
1. `PENDING`
2. `ANALYZING`
3. `GENERATING_ANALYSIS_REPORT` (Enterprise only ??produces Enterprise Analysis Report artifact)
4. `WAITING_STRATEGY`
5. `WAITING_SPEC_APPROVAL`
6. `GENERATING_TESTS`
7. `BASELINE_VALIDATION`
8. `REFACTORING`
9. `SELF_HEALING`
10. `WAITING_INTERVENTION` (paused at identical-failure threshold ??user chooses Deep Fix or Intervene)
11. `DEEP_FIX_ACTIVE` (context purge in progress, first-principles re-analysis)
12. `USER_INTERVENING` (user is manually editing or issuing natural-language repair commands)
13. `DELIVERED`
14. `FALLBACK_REQUIRED`
15. `FAILED`
16. `RECOVERY_PENDING`
17. `BASELINE_VALIDATION_FAILED`
18. `WAITING_ESCALATION_DECISION`
19. `CLIENT_HEARTBEAT_LOST`

Required transitions:
1. Strategy selected before spec extraction can continue.
2. For Enterprise accounts: `ANALYZING` transitions to `GENERATING_ANALYSIS_REPORT` before `WAITING_STRATEGY`; report artifact must be generated and accessible before strategy selection screen is shown.
3. Spec must be approved before test generation.
4. Baseline pass required before refactor loop.
5. Baseline failure in `BASELINE_VALIDATION` transitions to `BASELINE_VALIDATION_FAILED`.
6. User action `Revise Specs` from `BASELINE_VALIDATION_FAILED` transitions to `WAITING_SPEC_APPROVAL` within the same job. On this transition, `attempt_count`, `identical_failure_count`, and `failure_pattern_fingerprint` must be atomically reset to their initial values (0, 0, null). The spec revision invalidates all prior attempt history for this job; failure to reset these counters would cause the new spec-based execution to immediately exhaust retry budget carried over from the previous failed attempt set.
7. In `SELF_HEALING`: if identical failure pattern detected for 3 consecutive attempts, transition to `WAITING_INTERVENTION`. Total retry budget (default 10) still governs maximum attempts across all sub-phases.
8. From `WAITING_INTERVENTION`, user selects:
   - `Deep Fix` ??`DEEP_FIX_ACTIVE` ??on completion, back to `SELF_HEALING` with reset attempt counter.
   - `Intervene` ??`USER_INTERVENING` ??on `Run tests` pass, resumes from current refactoring state.
   - `Continue standard repair` ??`SELF_HEALING` continues without reset (retries remain within total budget).
9. `DEEP_FIX_ACTIVE` performs: context purge for failing scope, first-principles re-analysis, auto-model-upgrade for eligible tiers, generates new patch. On success: transitions back to `SELF_HEALING`. On failure: returns to `WAITING_INTERVENTION`.
10. `USER_INTERVENING` accepts: (a) manual edits to source files in VS Code, (b) natural-language command input via command panel ??AI interprets and applies repair without full context; each command execution runs test suite and shows structured result.
11. Total retry budget overflow (across all phases including Deep Fix cycles) transitions to `RECOVERY_PENDING`.
7. Explicit user cancellation transitions to `FAILED` with reason code.
8. `RECOVERY_PENDING` performs workspace restore and patch packaging before terminal state.
9. `RECOVERY_PENDING` transitions to `FALLBACK_REQUIRED` after successful restore/packaging.
10. `RECOVERY_PENDING` transitions to `FAILED` if restore/packaging fails.
11. From `FALLBACK_REQUIRED`, user action `Revise Specs and Rerun` transitions to `WAITING_SPEC_APPROVAL` within the same job. On this transition, `attempt_count`, `identical_failure_count`, and `failure_pattern_fingerprint` must be atomically reset to their initial values (0, 0, null). The spec revision invalidates all prior attempt history for this job; counter reset is mandatory before the new execution cycle begins.
12. Phase escalation transitions to `WAITING_ESCALATION_DECISION` only when no valid pre-authorization exists; with valid pre-authorization, workflow continues directly to next phase without blocking. `WAITING_ESCALATION_DECISION` enforces confirmation timeout (default `3600s`); timeout applies pre-authorization policy if present, otherwise transitions to `FAILED` with reason `ESCALATION_CONFIRMATION_TIMEOUT`.
13. Job start must acquire quota reservation before entering `ANALYZING`; reservation failure blocks start with machine-readable quota reason.
14. Reservations must be released on non-chargeable system cancellation/failure paths per policy.
15. IDE-attached local jobs must emit heartbeat to control plane; initial heartbeat loss immediately pauses cloud token generation and starts `300s` grace recovery window.
16. If heartbeat is restored before grace expiry, workflow resumes without terminal disconnect; if not restored, transition to `CLIENT_HEARTBEAT_LOST`.
17. `CLIENT_HEARTBEAT_LOST` transitions to `FAILED` with reason code `CLIENT_DISCONNECTED` unless explicit recovery policy is triggered.
18. If disconnect happens before `GENERATING_TESTS`, quota reservation is released with non-chargeable disconnect class per billing policy.
19. If disconnect happens at/after `GENERATING_TESTS`, chargeable reservation remains committed and job outputs/evidence remain retrievable via `job_id`.

## 14. UX and UI Design Requirements
This section is mandatory. Visual output must not look AI-generated or generic.

> Design specification documents:
> - Design system (icons, typography, color, components): `Docs/UX/UX-DESIGN-SYSTEM.md`
> - IDE wireframe spec (all screens and flows): `Docs/UX/UX-WIREFRAME-IDE.md`
> - Web portal wireframe spec: `Docs/UX/UX-WIREFRAME-WEB.md`
> Icon library: **Lucide** (primary), Heroicons/Phosphor (acceptable alternatives), custom SVG where Lucide lacks coverage.
> No emoji in any functional UI. No AI chat-bubble layout.

### 14.1 Product design direction
1. Tone: engineering-grade, precise, trustworthy.
2. Visual language: code intelligence workspace, not chatbot toy.
3. Information hierarchy: workflow evidence first, generated text second.

### 14.2 Hard constraints (must follow)
1. Do not use default AI chat bubble layout as primary interaction model.
2. Do not rely on generic purple-gradient SaaS visual language.
3. Do not ship pages that look template-generated or interchangeable.
4. Use intentional typography system with strong hierarchy.
5. Provide clear risk indicators and state badges in all key screens.

### 14.3 IDE screen inventory
1. Login handoff screen.
2. Job setup and target selection.
3. Strategy selection panel (3-level cards).
4. Spec Workbench (BDD + SDD natural-language editor with revision timeline).
5. Execution console (live logs + attempt timeline).
6. Delivery diff view.
7. Fallback intervention workspace.
8. Usage summary drawer.

### 14.4 Web screen inventory
1. Sign in / register.
2. Plan and billing.
3. Usage analytics.
4. Account security.
5. Job history and audit viewer.

### 14.5 Internal admin screen inventory
1. User 360 and quota override workspace.
2. System health and model routing configuration.
3. Feature flag and kill switch control panel.

### 14.6 Accessibility requirements
1. Keyboard navigable primary actions.
2. Color contrast passing modern accessibility standards.
3. Motion reductions for sensitive users.
4. Screen-reader labels for critical workflow controls.

## 15. Security and Compliance Requirements
1. Authenticated access required for all user resources.
2. Job ownership authorization required for all read/write job actions.
3. Token secrets must never rely on inconsistent defaults.
4. Prompt and response logs must support redaction policy.
5. Billing and identity events require immutable audit records.
6. Secrets must not be exposed to IDE UI logs.
7. Data at rest encryption is mandatory for code-bearing artifacts and logs in database/object storage, using AES-256-class encryption with managed KMS/HSM key lifecycle controls.
8. Artifact TTL policy is mandatory: code-bearing artifacts/logs must be hard-deleted automatically after retention window (default `14 days`, policy-configurable), while non-code metadata is retained for audit/billing.
9. Enterprise support payloads must default to metadata-only mode unless organization-level code-context sharing is explicitly enabled and audited.
10. Telemetry data minimization is mandatory: product analytics payloads must exclude raw BDD/SDD text, keystroke logs, AST/source fragments, and prompt body content; enterprise scope must support policy-enforced `Zero Telemetry Mode`.

## 16. Non-Functional Requirements
1. API availability target: `99.5%` monthly.
2. Median job status polling latency: `< 500ms`.
3. Live stream update cadence target: `<= 2s`.
4. Max tolerated workflow state drift: `0` known unresolved drift events.
5. Horizontal scalability required for cloud control components.
6. API gateway must enforce tier-based request rate limits (RPM/TPS + burst policies) and return deterministic `429` responses for over-limit traffic.
7. Heartbeat timeout detection and cloud token-halt propagation for IDE-attached local jobs must complete within `<= 10s` after threshold breach.
8. Stream auth refresh/resume for long-lived Server-Sent Events (SSE) sessions must recover within `<= 5s` p95 after token rollover under normal conditions.

## 17. QA and Acceptance
Required test groups:
1. Auth and account flows.
2. Subscription and usage enforcement.
3. Cross-user authorization protection.
4. Spec revision persistence.
5. Baseline fail gating behavior.
6. Retry loop correctness.
7. Fallback evidence completeness.
8. IDE-to-cloud contract compatibility.
9. UI conformance to anti-AI-look constraints.
10. Local Native child-process isolation and timeout enforcement.
11. Configurable timeout behavior validation (default 30 seconds and settings override).
12. Token cap enforcement, AST pruning behavior, and fail-fast overflow blocking.
13. Prompt caching hit/miss accounting and cost reduction telemetry.
14. Base-hash conflict detection before patch application.
15. Backward transitions from `BASELINE_VALIDATION_FAILED` and `FALLBACK_REQUIRED` to `WAITING_SPEC_APPROVAL`.
16. Three-phase model-routing waterfall with entitlement enforcement and escalation confirmation.
17. Payment webhook reconciliation, idempotent processing, and automatic quota provisioning/deprovisioning.
18. Secret scanning enforcement, including rejection of `.env` payload leakage and AWS key pattern uploads.
19. Admin API RBAC enforcement so regular users cannot access dynamic-config, kill-switch, or quota-override APIs.
20. API gateway rate-limiting behavior, including tier-specific thresholds, burst handling, and machine-readable `429` responses.
21. Encryption-at-rest verification for stored code-bearing artifacts/logs, including key-reference integrity and decrypt-permission controls.
22. Quota reservation race-condition tests (multi-session concurrent starts) ensuring no double-spend and correct release/commit behavior.
23. Artifact TTL enforcement tests ensuring hard-delete of code-bearing data after retention deadline and metadata-only retention.
24. IDE heartbeat/orphan tests ensuring disconnect enters pause+grace path, recovers cleanly when heartbeat returns within `300s`, and sets deterministic `CLIENT_DISCONNECTED` only after grace expiry.
25. Context file-bomb tests ensuring binary files, compiled assets, and oversized minified bundles are blocked before AST parsing and token counting.
26. Pruning-to-delivery mapping tests ensuring edit operations generated from pruned context apply correctly to full target files via `patch_edit_schema` protocol.
27. Timeout-classification tests ensuring `TIMEOUT_EXECUTION` path is distinct from `LOGIC_FAILURE` and follows timeout-specific continuation policy.
28. Disconnect billing checkpoint tests validating pre/post-`GENERATING_TESTS` charge behavior and artifact recovery via `job_id`.
29. Enterprise support payload tests ensuring metadata-only default and audited admin override for contextual data sharing.
30. Long-lived stream auth tests ensuring token expiration mid-job triggers seamless refresh/resume without user-visible `401` interruption.
31. Telemetry privacy tests ensuring funnel events never include raw BDD/SDD/prompt/source content, and enterprise `Zero Telemetry Mode` suppresses behavior tracking payloads.
32. Waterfall routing tests ensuring pre-authorized escalation proceeds without runtime confirmation blocking, while non-preauthorized runs pause at `WAITING_ESCALATION_DECISION`.
33. Baseline-blocker UX tests ensuring failed baseline path exposes explicit `Quarantine / Mock Overrides` controls with auditable decision trail.

Release gate:
1. No P0 defects open.
2. No unauthorized data access vulnerability.
3. All P0 acceptance criteria validated in staging.

## 18. Risks and Mitigations
1. Risk: Generic AI-looking UX reduces trust.  
Mitigation: enforce design review checklist with explicit anti-pattern rejection.

2. Risk: Schema drift between model output and workflow input.  
Mitigation: strict schema validation and contract versioning.

3. Risk: Cross-tenant data exposure through weak ownership checks.  
Mitigation: centralized authorization guard for all job endpoints.

4. Risk: Baseline invalid tests causing false success signals.  
Mitigation: mandatory baseline gate and explicit failure branch.

## 19. Deliverables Checklist
1. Product spec complete and approved.
2. UX spec complete for IDE and web surfaces.
   - Design system: `Docs/UX/UX-DESIGN-SYSTEM.md`
   - IDE wireframes: `Docs/UX/UX-WIREFRAME-IDE.md`
3. API contract catalog complete.
4. Schema catalog complete.
5. State machine definition complete.
6. QA acceptance matrix complete.
7. Architecture Decision Records complete.
   - ADR-001 (Workflow Engine): `Docs/ADR/ADR-001-Workflow-Engine.md` ??**DECIDED: Temporal.io**
   - ADR-002 (LLM Proxy): `Docs/ADR/ADR-002-LLM-Proxy.md` ??**DECIDED: LiteLLM + custom routing layer**

This checklist is required before implementation is considered complete.

## 20. Sprint 0 PoC Requirements

The following PoCs must be completed **before** the relevant sprint begins. Any PoC failure requires PRD re-evaluation of the affected requirements before proceeding.

**PoC #1 ??Dual-language Schema Sync (Node.js API ??Python Temporal Worker)**
- Objective: Verify Prisma or OpenAPI codegen can maintain type consistency between Node.js and Python codebases. Confirm AI agents switching between codebases do not produce field mismatch errors.
- Estimated effort: 3?? days.
- Blocking: All backend sprint work.

**PoC #2 ??`patch_edit_schema` Apply Mechanism**
- Objective: Validate that `EXACT_SEARCH_REPLACE` can be reliably applied across all V1 target languages. Then validate `AST_SYMBOLIC` for Python and TypeScript only.
- V1.0 delivery constraint:
  - `EXACT_SEARCH_REPLACE`: must work for all supported languages.
  - `AST_SYMBOLIC`: Python and TypeScript only in V1.0.
  - `AST_SYMBOLIC` for other languages: V1.x roadmap item.
  - `AST_SYMBOLIC` must NOT enter any sprint scope until this PoC produces a passing result for that language.
- Estimated effort: 5?? days (Python + TypeScript rounds).
- Blocking: All patch delivery and self-healing work.

**PoC #3 ??Cross-Ecosystem Black-Box Mode** *(V1.x ??downgraded from V1.0 required)*
- Objective: Validate Black-Box CLI/HTTP orchestration testing against a real legacy target (e.g., a COBOL or Delphi binary).
- Status: Required before V1.x cross-ecosystem feature enters any sprint. Not required for V1.0.
- Estimated effort: 1 week (when scheduled).
- Blocking: V1.x cross-ecosystem feature only.

**PoC #4 ??E2B Snapshot / CoW Mechanism** *(V2 only)*
- Objective: Verify E2B Custom Image/Snapshot supports sub-second cache mount for dependency layers. Confirm per-job Copy-on-Write isolation between `organization_id` and `repository_id` scopes. Confirm secure wipe of CoW layers is verifiable.
- If E2B cannot satisfy requirements: `V2-FR-RUN-008` must be re-evaluated before V2 begins.
- Estimated effort: 3 days.
- Blocking: V2 Sprint 0 only (V1 unaffected).




