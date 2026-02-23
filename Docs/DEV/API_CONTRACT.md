# IAMA API Contract

Document ID: `IAMA-DEV-API`
Version: `1.0`
Status: `Authoritative`
Audience: Backend Engineers, Frontend Engineers, AI Agent Developers

## 1. Overview

This document defines the complete API surface for IAMA V1 and V2.
All endpoints listed here are required. Agents must not invent endpoints not listed here.
All endpoints not listed here require a PRD update before implementation.

**Host**: `https://api.iama.dev`
**Auth**: Bearer JWT in `Authorization` header for all protected endpoints.

**Route versioning convention** (authoritative — do not deviate):
- V1 routes: full path is `/api/v1/<resource>` (e.g. `POST https://api.iama.dev/api/v1/jobs`)
- V2 routes: full path is `/api/v2/<resource>` (e.g. `POST https://api.iama.dev/api/v2/github/connect`)
- All route definitions in this document show the full path including version prefix.
- Breaking changes to V1 routes that cannot be backward-compatible require a new V2 route.

---

## 2. Authentication Endpoints

### `GET /api/v1/auth/oauth/github/initiate`
Initiate GitHub OAuth login flow for VS Code IDE (V1-FR-AUTH-002). Returns the GitHub authorization URL for the IDE to open in the system browser.
```
Query params:
  redirect_uri: string (optional, vscode:// deep link override)

Response 200:
  authorization_url: string (GitHub OAuth authorization page URL — open in system browser)
  state_token: string (anti-CSRF token; must be sent back in callback and validated server-side)
```

### `GET /api/v1/auth/oauth/google/initiate`
Initiate Google OAuth login flow for VS Code IDE (V1-FR-AUTH-002).
```
Query params:
  redirect_uri: string (optional)

Response 200:
  authorization_url: string
  state_token: string
```

### `GET /api/v1/auth/oauth/callback`
OAuth callback handler for VS Code browser-based login (V1-FR-AUTH-002). Handles both GitHub and Google providers. Identified by `state_token` prefix.
```
Query params:
  code: string
  state: string

Response 302:
  Location: vscode://iama.extension/auth?token=...
```

**Email collision policy** (authoritative behavior when OAuth provider email matches an existing email/password account):
- If `oauth_accounts` already has a row for `(provider, provider_account_id)`: treat as returning OAuth user — link to existing `users.id`, issue token.
- If no `oauth_accounts` row exists but `users.email` matches the provider-verified email: **auto-merge** — create a new `oauth_accounts` row linking to the existing `users.id`, then issue token. This trusts the provider's verified email as equivalent identity proof. The user's existing password remains valid for future password logins.
- If provider email is unverified (GitHub can return unverified emails): treat as no-match — create a new separate `users` row and `oauth_accounts` row; do **not** auto-merge with an existing email/password account.
- The server must never auto-merge when provider email is absent or unverified. In that case, create a new account and let the user manually link via account settings (V2 feature; link UI is out of scope for V1).

### `POST /api/v1/auth/register`
Register a new user with email/password.
```
Request:
  email: string (required)
  password: string (required, min 8 chars)

Response 201:
  user_id: string (uuid)
  email: string
  created_at: ISO8601

Response 400:
  error_code: "INVALID_EMAIL" | "WEAK_PASSWORD" | "EMAIL_ALREADY_EXISTS"
  message: string
```

### `POST /api/v1/auth/login`
Login with email/password.
```
Request:
  email: string
  password: string

Response 200:
  access_token: string (JWT, 15min expiry)
  refresh_token: string (opaque, 30-day expiry)
  expires_in: number (seconds)

Response 401:
  error_code: "INVALID_CREDENTIALS"
```

### `POST /api/v1/auth/refresh`
Refresh access token for long-lived SSE sessions (V1-FR-AUTH-004).
```
Request:
  refresh_token: string

Response 200:
  access_token: string
  expires_in: number

Response 401:
  error_code: "REFRESH_TOKEN_EXPIRED" | "REFRESH_TOKEN_INVALID"
```

### `POST /api/v1/auth/logout`
Revoke refresh token.
```
Request (authenticated):
  refresh_token: string

Response 204: (no body)
```

---

## 3. Subscription and Usage Endpoints

### `GET /api/v1/subscription/me`
Get current user's tier, entitlements, and billing status (V1-FR-SUB-001). Reads from `subscription_tiers` — authoritative source for access control.
```
Response 200:
  tier: "FREE" | "PLUS" | "PRO" | "MAX" | "ENTERPRISE"
  context_cap: number (tokens)
  operating_mode: "SIMPLE" | "PROFESSIONAL" | "ENTERPRISE"
  phase_1_limit: { type: "daily" | "monthly" | "unlimited", limit: number | null }
  phase_2_limit: { type: "monthly" | "unlimited", limit: number | null }
  phase_3_limit: { type: "monthly" | "unlimited", limit: number | null }
  execution_environments: ["LOCAL"] | ["LOCAL", "CLOUD"]
  web_github_enabled: boolean
  enterprise_report_enabled: boolean
  billing_status: "ACTIVE" | "PAST_DUE" | "CANCELLED"
```

### `GET /api/v1/usage/summary`
Get current-cycle usage summary for IDE display (V1-FR-SUB-003).
```
Response 200:
  cycle_start: ISO8601
  cycle_end: ISO8601
  phase_1: { used: number, limit: number | null, reset_type: "daily" | "monthly" }
  phase_2: { used: number, limit: number | null }
  phase_3: { used: number, limit: number | null }
  last_updated: ISO8601
```

### `GET /api/v1/usage/job/:job_id`
Per-job usage breakdown.
```
Response 200:
  job_id: string
  phase_1_calls: number
  phase_2_calls: number
  phase_3_calls: number
  prompt_tokens: number
  completion_tokens: number
  sandbox_seconds: number
  billable: boolean
  failure_class: string | null
```

---

## 4. Job Endpoints (V1)

### `POST /api/v1/jobs`
Create a new refactor job (V1-FR-JOB-001).
```
Request:
  project_id: string (optional, defaults to default project)
  target_paths: string[] (required, relative workspace paths)
  execution_mode: "LOCAL_DOCKER" | "LOCAL_NATIVE" | "REMOTE_SANDBOX"
  refactor_context: string (optional, plain-language description)

Response 201:
  job_id: string
  status: "PENDING"
  created_at: ISO8601
  quota_reservation_id: string

Response 403:
  error_code: "ENTITLEMENT_DENIED" (when REMOTE_SANDBOX requested by Free/Plus)
  denial_reason: "EXECUTION_ENVIRONMENT_NOT_ENTITLED"

Response 429:
  error_code: "QUOTA_EXCEEDED_DAILY" | "QUOTA_EXCEEDED_MONTHLY"
  retry_after: ISO8601
```

### `GET /api/v1/jobs`
List jobs for current user.
```
Query params:
  limit: number (default 20, max 100)
  offset: number (default 0)
  status: string (optional filter)

Response 200:
  items: Job[]
  total: number
  has_more: boolean
```

### `GET /api/v1/jobs/:job_id`
Get job detail.
```
Response 200:
  job_id: string
  status: WorkflowState  -- canonical PRD states; see Section 13 of IAMA_PRODUCT_REQUIREMENTS_V1_EN.md
  created_at: ISO8601
  updated_at: ISO8601
  target_paths: string[]
  execution_mode: string
  current_phase: number | null
  attempt_count: number
  identical_failure_count: number
  failure_pattern_fingerprint: string | null
  baseline_mode: "ASSERTION" | "CHARACTERIZATION" | "BLACK_BOX_ORCHESTRATION" | null
  artifact_expires_at: ISO8601 | null
  heartbeat_status: "ACTIVE" | "PAUSED" | "GRACE_PERIOD" | "LOST" | null
  last_heartbeat_at: ISO8601 | null
  grace_deadline_at: ISO8601 | null

Response 403:
  error_code: "JOB_OWNERSHIP_VIOLATION"
```

### `POST /api/v1/jobs/:job_id/start`
Transition job from PENDING to ANALYZING (acquires quota reservation atomically).
```
Response 200:
  job_id: string
  status: "ANALYZING"

Response 409:
  error_code: "QUOTA_RESERVATION_FAILED"
  denial_reason: string
```

### `DELETE /api/v1/jobs/:job_id`
Cancel job (transitions to FAILED with USER_CANCELLED reason).
```
Response 200:
  job_id: string
  status: "FAILED"
  failure_reason: "USER_CANCELLED"
```

### `GET /api/v1/jobs/:job_id/proposals`
Get strategy proposals for a job in WAITING_STRATEGY state.
```
Response 200:
  proposals:
    - id: string
      level: "CONSERVATIVE" | "STANDARD" | "COMPREHENSIVE"
      title: string
      summary: string (plain language)
      risk_score: number (1-5)
      technical_analysis: object | null (Professional Mode only)
      estimated_complexity: string | null (Professional Mode only)
```

### `POST /api/v1/jobs/:job_id/proposals/select`
Select a strategy proposal.
```
Request:
  proposal_id: string

Response 200:
  job_id: string
  status: "WAITING_SPEC_APPROVAL"
```

### `GET /api/v1/jobs/:job_id/spec`
Get BDD and SDD for job.
```
Response 200:
  bdd_items: BDDItem[]
  sdd_items: SDDItem[]
  revision_id: string
  revision_token: string (for optimistic lock)
  updated_at: ISO8601
```

### `PATCH /api/v1/jobs/:job_id/spec`
Update BDD/SDD spec (V1-FR-SPEC-002; V2-FR-WF-002 for cross-surface concurrent lock).

**Natural language to BDD/SDD conversion**: PRD requires users to edit specs via natural language (V1-FR-SPEC-002). The conversion path is:
1. User types plain-language intent in the IDE panel.
2. IDE client sends it to `POST /api/v1/jobs/:job_id/spec/nl-convert` (see below) which returns a structured `BDDItem[]` / `SDDItem[]` preview.
3. User reviews and optionally tweaks the structured output.
4. IDE client submits the final structured payload to this `PATCH` endpoint.

Direct structured submission (bypassing NL conversion) is also valid for API clients and Segment B/C users who prefer to edit the structured form directly.
```
Request:
  revision_token: string (required for concurrency control)
  bdd_items: BDDItem[] (optional)
  sdd_items: SDDItem[] (optional)

Response 200:
  revision_id: string
  revision_token: string (new token)

Response 409:
  error_code: "SPEC_REVISION_CONFLICT"
  current_revision_token: string
  diff_payload: object
```

### `POST /api/v1/jobs/:job_id/spec/nl-convert`
Convert a plain-language description into structured BDDItem[] / SDDItem[] (V1-FR-SPEC-002). Uses L2 model for NL interpretation. Result is a **preview only** — not committed until the user submits via `PATCH /spec`.
```
Request:
  natural_language_input: string (required; user's plain-language description of desired behavior)
  mode: "BDD" | "SDD" | "BOTH" (default: "BOTH")
  revision_token: string (required; used to validate currency — same token that will be used on PATCH)

Response 200:
  bdd_items: BDDItem[] | null
  sdd_items: SDDItem[] | null
  model_class_used: "L1" | "L2"

Response 429:
  error_code: "QUOTA_EXHAUSTED" (NL conversion uses L2 quota)
```

### `POST /api/v1/jobs/:job_id/spec/approve`
Approve spec and proceed to test generation.
```
Response 200:
  job_id: string
  status: "GENERATING_TESTS"
```

### `GET /api/v1/jobs/:job_id/logs`
SSE stream of live execution logs and real-time data sync (V1-FR-OBS-002, V2-FR-WF-004). Same endpoint path format used for V2 remote jobs. Both IDE and Web surfaces subscribe to this stream for the same `job_id` to achieve cross-surface state consistency.

**Authentication**: Browser-native `EventSource` API does not support custom `Authorization` headers. Clients MUST use [`@microsoft/fetch-event-source`](https://github.com/Azure/fetch-event-source) (or equivalent Fetch-based SSE implementation) instead of native `EventSource`, so that `Authorization: Bearer <token>` can be sent as a standard header. Passing tokens in URL query parameters is **prohibited** (they are recorded in server logs and proxy access logs).
```
Response: text/event-stream
Events:

  # Execution progress events
  data: { event: "state_change", state: WorkflowState, timestamp: ISO8601 }
  data: { event: "log_line", level: "INFO"|"WARN"|"ERROR", message: string, timestamp: ISO8601 }
  data: { event: "attempt_start", attempt: number, phase: number, model_class: string }
  data: { event: "attempt_end", attempt: number, passed: boolean, fingerprint: string | null }
  data: { event: "heartbeat_status", status: string, grace_deadline_at: ISO8601 | null }
  data: { event: "deep_fix_start", context_reset: true, model_upgraded: boolean }

  # Cross-surface spec sync events (V2-FR-WF-004)
  # Emitted whenever the spec (BDD/SDD) is updated by any surface (IDE or Web).
  # Client behaviour on receipt: trigger a GET /api/v1/jobs/:job_id/spec to fetch the latest
  # revision. Do NOT apply spec content directly from this event — always re-fetch to avoid
  # partial-payload race conditions.
  data: { event: "spec_updated", job_id: string, revision_id: string, revision_token: string, updated_by_surface: "IDE"|"WEB", timestamp: ISO8601 }

  # Delivery artifact availability event
  # Emitted when a delivery artifact transitions to DELIVERED state and is ready for client retrieval.
  # Client behaviour on receipt: trigger GET /api/v1/jobs/:job_id/delivery to fetch the artifact manifest.
  data: { event: "artifact_ready", job_id: string, artifact_expires_at: ISO8601, timestamp: ISO8601 }
```

### `GET /api/v1/jobs/:job_id/delivery`
Get delivery artifact for DELIVERED jobs (V1-FR-DEL-001).
```
Response 200:
  diff_files: FileDiff[]
  patch_artifact_url: string
  artifact_expires_at: ISO8601
  baseline_mode_used: string
  baseline_risk_note: string | null
  can_revert: boolean
```

### `POST /api/v1/jobs/:job_id/delivery/apply`
Apply delivery patch to workspace (partial accept supported per V1-FR-DEL-005).
```
Request:
  accept_all: boolean
  accepted_files: string[] (if not accept_all)
  accepted_hunks: { file: string, hunk_ids: string[] }[] (optional)

Response 200:
  applied_files: string[]
  skipped_files: string[]
  revert_available_until: ISO8601 | null
```

### `POST /api/v1/jobs/:job_id/delivery/revert`
Revert applied delivery (V1-FR-DEL-007).
```
Response 200:
  reverted: true

Response 409:
  error_code: "POST_COMMIT_REVERT_BLOCKED"
  reverse_patch_url: string
```

### `GET /api/v1/jobs/:job_id/fallback`
Get fallback evidence for FALLBACK_REQUIRED/FAILED jobs (V1-FR-DEL-002).
```
Response 200:
  failed_tests: FailedTest[]
  error_excerpts: string[]
  failure_pattern_fingerprint: string
  identical_failure_count: number
  last_patch_summary: string
  partial_artifact_url: string | null
  available_actions:
    - type: "DEEP_FIX"
      requires_confirmation: true   -- always true; front-end MUST show qualitative confirmation dialog
                                   -- before dispatching POST /intervention/deep-fix
                                   -- Suggested dialog copy:
                                   -- Title:  "Activate Deep Fix?"
                                   -- Body:   "Deep Fix is a high-consumption operation. It will reset the
                                   --          current context and use a higher-tier model to re-derive the
                                   --          patch from first principles. The exact quota impact varies by
                                   --          code complexity. This operation cannot be cancelled once started."
                                   -- Actions: ["Cancel", "Proceed with Deep Fix"]
    - type: "INTERVENE"
    - type: "RETRY_STRONGER_MODEL"
    - type: "EDIT_SPEC"
    - type: "DOWNLOAD_PARTIAL"
    - type: "REPORT_ISSUE"
```

### `POST /api/v1/jobs/:job_id/intervention/deep-fix`
Trigger Deep Fix cycle (V1-FR-TEST-003A).
```
Response 200:
  job_id: string
  status: "DEEP_FIX_ACTIVE"
  context_reset: true
  model_upgraded: boolean
  new_attempt_counter: 0
```

### `POST /api/v1/jobs/:job_id/intervention/command`
Submit natural language command in USER_INTERVENING state (V1-FR-DEL-002).
```
Request:
  command: string (natural language instruction)

Response 200:
  command_id: string
  status: "USER_INTERVENING"

# Result delivered via SSE log stream as structured result block
```

### `POST /api/v1/jobs/:job_id/intervention/run-tests`
Trigger test run after manual edit in USER_INTERVENING state (V1-FR-DEL-002).
```
Response 200:
  test_run_id: string
  status: "RUNNING"
```

### `POST /api/v1/jobs/:job_id/heartbeat`
IDE client heartbeat for IDE-attached local jobs (V1-FR-JOB-007).
```
Request:
  job_id: string
  session_id: string

Response 200:
  acknowledged: true
  grace_deadline_at: ISO8601 | null

Response 404:
  error_code: "JOB_NOT_FOUND" | "HEARTBEAT_SESSION_INVALID"
```

### `POST /api/v1/jobs/:job_id/force-terminate`
Force terminate job during grace period (V1-FR-JOB-007 acceptance addendum).
```
Response 200:
  job_id: string
  status: "FAILED"
  failure_reason: "FORCE_TERMINATED_BY_USER"
```

### `GET /api/v1/jobs/:job_id/enterprise-report`
Get Enterprise Analysis Report artifact (V1-FR-PRO-002, Enterprise only).
```
Response 200:
  pdf_url: string
  json_url: string
  generated_at: ISO8601
  expires_at: ISO8601

Response 403:
  error_code: "ENTITLEMENT_DENIED"
  denial_reason: "ENTERPRISE_TIER_REQUIRED"
```

---

## 5. Billing Endpoints (V1)

### `GET /api/v1/billing/plan`
Get current plan and upgrade paths.
```
Response 200:
  current_tier: string
  billing_cycle_start: ISO8601
  billing_cycle_end: ISO8601
  next_billing_date: ISO8601
  upgrade_options: { tier: string, price_monthly: number }[]
  portal_url: string (Stripe/LemonSqueezy customer portal URL)
```

### `POST /api/v1/billing/checkout`
Create checkout session for upgrade.
```
Request:
  target_tier: "PLUS" | "PRO" | "MAX" | "ENTERPRISE"

Response 200:
  checkout_url: string
```

### `POST /api/v1/webhooks/payment`
Payment gateway webhook handler (internal, protected by webhook secret). Updates `payment_subscriptions` then syncs to `subscription_tiers`.
```
Events handled:
  - payment_succeeded → grant quota
  - payment_failed → downgrade or lock premium
  - subscription_cancelled → downgrade
  - subscription_renewed → refresh quota

Response 200: (must be idempotent; check last_webhook_event_id before processing)
```

### `GET /api/v1/billing/usage-report`
Metered overage usage report for add-on purchase (V1-FR-PAY-004).
```
Response 200:
  period_start: ISO8601
  period_end: ISO8601
  phase_2_overage: number
  phase_3_overage: number
  sandbox_seconds_overage: number
  estimated_overage_cost: number
```

---

## 6. Admin and Operator Endpoints (V1)

Admin endpoints use a **separate authentication system** from end-user JWT tokens.
All admin endpoints require a valid `admin_sessions` token in the `Authorization: Bearer <token>` header.

**Roles**: `SUPER_ADMIN` | `ENGINEER` | `SUPPORT` — see `DB_SCHEMA.md` Section 19 for permission matrix.

### Admin Authentication

#### `POST /api/v1/admin/auth/login`
Authenticate admin account. No OAuth — email/password only.
```
Request:
  email: string
  password: string

Response 200:
  token: string (opaque session token; 8-hour expiry; store securely)
  admin_id: string
  role: "SUPER_ADMIN" | "ENGINEER" | "SUPPORT"
  expires_at: ISO8601

Response 401:
  error_code: "INVALID_CREDENTIALS"

Response 403:
  error_code: "ACCOUNT_SUSPENDED" | "ACCOUNT_DEACTIVATED"
```

#### `POST /api/v1/admin/auth/logout`
Revoke current session token.
```
Response 204: (no body)
```

#### `GET /api/v1/admin/auth/me`
Get current admin identity and role.
```
Response 200:
  admin_id: string
  email: string
  role: "SUPER_ADMIN" | "ENGINEER" | "SUPPORT"
  last_login_at: ISO8601
```

#### `PATCH /api/v1/admin/auth/me/password`
Change own password (all roles).
```
Request:
  current_password: string
  new_password: string (min 12 chars)

Response 204: (no body)

Response 400:
  error_code: "WEAK_PASSWORD" | "CURRENT_PASSWORD_INCORRECT"
```

---

### Admin Account Management (SUPER_ADMIN only)

#### `GET /api/v1/admin/accounts`
List all admin accounts. **Required role: SUPER_ADMIN**.
```
Response 200:
  accounts:
    - admin_id: string
      email: string
      role: string
      status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
      last_login_at: ISO8601 | null
      created_at: ISO8601
```

#### `POST /api/v1/admin/accounts`
Create new admin account. **Required role: SUPER_ADMIN**.
```
Request:
  email: string
  password: string (min 12 chars; user must change on first login)
  role: "ENGINEER" | "SUPPORT"  -- SUPER_ADMIN cannot be created via API; bootstrap only

Response 201:
  admin_id: string
  email: string
  role: string
  created_at: ISO8601

Response 409:
  error_code: "EMAIL_ALREADY_EXISTS"
```

#### `PATCH /api/v1/admin/accounts/:admin_id`
Update admin account role or status. **Required role: SUPER_ADMIN**. Cannot target own account.
```
Request:
  role: "ENGINEER" | "SUPPORT" (optional)
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" (optional)
  reason: string

Response 200:
  admin_id: string
  role: string
  status: string
  audit_event_id: string

Response 403:
  error_code: "CANNOT_MODIFY_OWN_ACCOUNT" | "CANNOT_MODIFY_LAST_SUPER_ADMIN"
```

#### `POST /api/v1/admin/accounts/:admin_id/reset-password`
Force-reset admin password (generates temporary password; user must change on next login). **Required role: SUPER_ADMIN**.
```
Response 200:
  temporary_password: string (one-time; expires in 24h)
  audit_event_id: string
```

---

### Operator Controls

#### `GET /api/v1/admin/users/:user_id`
User 360 view — tier, usage, recent jobs. **Required role: SUPER_ADMIN, ENGINEER, SUPPORT**.
```
Response 200:
  user_id: string
  email: string
  tier: string
  created_at: ISO8601
  recent_jobs: Job[] (last 10)
  current_usage: UsageSummary
  billing_status: string
```

#### `PATCH /api/v1/admin/quota/:user_id`
Manual quota adjustment (V1-FR-OPS-003). **Required role: SUPER_ADMIN, SUPPORT**.
```
Request:
  phase: 1 | 2 | 3
  delta: number (positive for add, negative for deduct)
  reason_code: string

Response 200:
  new_balance: number
  audit_event_id: string
```

#### `POST /api/v1/admin/kill-switch`
Global or per-user kill switch (V1-FR-OPS-002).
Global scope requires **SUPER_ADMIN or ENGINEER**. Per-user scope additionally allows **SUPPORT**.
```
Request:
  scope: "GLOBAL" | "USER"
  user_id: string (required if scope = USER)
  action: "ENABLE" | "DISABLE"
  reason: string

Response 200:
  effective_at: ISO8601
  audit_event_id: string

Response 403:
  error_code: "ROLE_INSUFFICIENT"
  required_role: string
```

#### `GET /api/v1/admin/config`
Get all dynamic configuration entries (V1-FR-OPS-001). **Required role: SUPER_ADMIN, ENGINEER**.
```
Response 200:
  entries:
    - key: string
      value: any  -- api_key_ref values are masked to "***" for all roles
      scope: "GLOBAL" | "ORG" | "USER"
      updated_at: ISO8601
      updated_by: string (admin email)
      reason: string
```

#### `PUT /api/v1/admin/config/:key`
Update a dynamic config value (V1-FR-OPS-001). **Required role: SUPER_ADMIN, ENGINEER**.
Keys matching `*.api_key_ref` pattern require **SUPER_ADMIN** — all other keys allow ENGINEER.
See `DB_SCHEMA.md` Section 8.1 for the authoritative config key namespace.
```
Request:
  value: any  -- for api_key_ref keys: a secrets manager path string only; never the raw secret
  reason: string

Response 200:
  key: string
  effective_at: ISO8601
  audit_event_id: string

Response 403:
  error_code: "ROLE_INSUFFICIENT"
  detail: "api_key_ref keys require SUPER_ADMIN"
```

#### `GET /api/v1/admin/health`
System health dashboard (V1-FR-OPS-004). **Required role: SUPER_ADMIN, ENGINEER**.
```
Response 200:
  api_error_rate_1h: number
  workflow_success_rate_24h: number
  model_provider_status: { provider: string, status: "OK" | "DEGRADED" | "DOWN" }[]
  active_jobs: number
  queue_depth: number
  config_last_updated_at: ISO8601
  kill_switch_active: boolean
```

---

## 7. Support Endpoints (V1)

### `POST /api/v1/support/tickets`
Create support ticket from IDE (V1-FR-SUP-002).
```
Request:
  job_id: string
  issue_type: "JOB_FAILED" | "BILLING_ISSUE" | "OTHER"
  description: string (optional)
  consent_to_share_logs: boolean

Response 201:
  ticket_id: string
  external_ticket_id: string
  created_at: ISO8601
```

---

## 8. V2 GitHub Integration Endpoints

### `POST /api/v2/github/connect`
Initiate GitHub App installation flow for repository access (V2-FR-GH-001).

> **Architecture note**: V2 GitHub integration uses **GitHub App** (not OAuth App). GitHub App provides installation-scoped, fine-grained repository permissions and issues short-lived installation access tokens. This is distinct from user login OAuth (`/api/v1/auth/oauth/github/initiate`). The `github_installation_id` stored in `repository_connections` is the GitHub App installation identifier — it is required to generate per-repo access tokens and to process `github_app_authorization` revocation webhooks (V2-FR-GH-010).
```
Response 200:
  install_url: string (GitHub App installation/authorization URL — open in browser to install or authorize the IAMA GitHub App)
  state_token: string (anti-CSRF token; validated server-side on callback)
```

### `GET /api/v2/github/callback`
GitHub App installation callback handler. Receives `installation_id` and `setup_action` from GitHub after the user installs or authorizes the IAMA GitHub App.
```
Query:
  installation_id: string (GitHub App installation ID — stored as github_installation_id in repository_connections)
  setup_action: "install" | "update" | "request"
  state: string (anti-CSRF token validation)
Response 302: redirect to web portal with connection status
```

### `GET /api/v2/github/repos`
List connected repositories.
```
Query:
  page: number
  per_page: number (max 50)

Response 200:
  repos: { id: string, full_name: string, default_branch: string, private: boolean }[]
  total: number
```

### `POST /api/v2/github/repos/:repo_id/preflight`
Run repository preflight checks — size, file count, path scope (V2-FR-GH-006).
```
Request:
  branch: string
  path_scope: string (required subdirectory path)

Response 200:
  passed: boolean
  file_count: number
  size_mb: number
  violations: { type: string, detail: string }[]
```

### `DELETE /api/v2/github/connection`
Revoke GitHub OAuth connection (V2-FR-GH-007).
```
Response 200:
  revoked: true
  active_syncs_terminated: number
  audit_event_id: string
```

### `POST /api/v2/webhooks/github`
GitHub App webhook handler — handles `github_app_authorization` revocation (V2-FR-GH-010).
```
Headers: X-GitHub-Event, X-Hub-Signature-256
Response 200: (idempotent)
```

### `POST /api/v2/jobs/:job_id/delivery/github`
Create GitHub branch + commit + PR for web-initiated delivery (V2-FR-WEB-004).
```
Request:
  branch_name: string
  pr_title: string
  pr_body: string
  draft: boolean (default: true per V2-FR-WEB-005)
  delivery_policy: "DRAFT_PR" | "READY_FOR_REVIEW_PR"

Response 200:
  pr_url: string
  branch_url: string
  commit_sha: string
  draft: boolean
  provenance: { co_authored_by: string, job_id: string }

Response 409:
  error_code: "REMOTE_HEAD_CONFLICT"
  current_head_sha: string
  job_start_head_sha: string
  recovery_options: ("AUTO_REBASE" | "MANUAL_RESOLVE")[]
```

### `POST /api/v2/jobs/:job_id/delivery/github/rebase`
Trigger auto-rebase after head conflict (V2-FR-GH-011).
```
Response 200:
  job_id: string
  status: "REMOTE_REBASE_VALIDATING"
```

### GitHub App Installation Token Auto-Refresh

GitHub App Installation Tokens have a hard 1-hour expiry enforced by GitHub and cannot be extended. For long-running V2 jobs (e.g., deep refactor + rebase cycles), the token acquired at `provisionSandbox` time may expire before `createGitHubPR` executes.

**Required behavior** for the Temporal `createGitHubPR` activity and any other GitHub API-calling activity:
1. Before making any GitHub API call, check `repository_connections.updated_at`.
2. If the stored token was issued more than **50 minutes ago** (with 10-minute safety buffer before the 1-hour expiry), call `POST https://api.github.com/app/installations/{installation_id}/access_tokens` using the GitHub App private key (via `Octokit.createAppAuth`) to obtain a fresh Installation Token.
3. Encrypt and store the new token back into `repository_connections.access_token_encrypted` + update `updated_at`.
4. Proceed with the GitHub API call using the fresh token.
5. On `401 Unauthorized` from GitHub mid-activity: treat as token-expired, attempt one refresh, then retry the failed API call. If refresh also fails (e.g., installation revoked), transition to `CLIENT_HEARTBEAT_LOST` equivalent error with reason `GITHUB_TOKEN_REFRESH_FAILED` and trigger revocation cleanup flow.

User Access Tokens (used for personal OAuth login flow, NOT for repository operations) have an 8-hour expiry and follow the standard JWT refresh path defined in `POST /api/v1/auth/refresh`. Do not conflate these two token types.

---

## 9. V2 Remote Sync Endpoints

### `GET /api/v2/jobs/:job_id/remote-artifact`
Get remote job artifact manifest for IDE Sync Remote Job (V2-FR-WEB-006).
```
Response 200:
  artifact_id: string
  artifact_hash: string (immutable)
  file_count: number
  diff_preview_url: string
  safe_apply_preconditions: { requires_clean_working_tree: boolean }
  created_at: ISO8601
```

### `POST /api/v2/jobs/:job_id/remote-artifact/apply`
Apply remote artifact to local workspace with conflict detection (V2-FR-WEB-007).
```
Request:
  local_base_hash: string (current workspace hash snapshot)
  conflict_resolution_mode: "BLOCK" | "THREE_WAY_MERGE" | "AUTO_STASH_APPLY_POP"

Response 200:
  applied: true
  conflict_markers: null

Response 409:
  error_code: "SYNC_APPLY_CONFLICT"
  overlapping_files: string[]
  conflict_resolution_options: string[]
  segment: "A" | "B_C" (determines which guidance to show)
```

---

## 10. V2 Compliance Endpoints

### `POST /api/v2/compliance/data-erasure`
Submit right-to-be-forgotten request.
```
Request (authenticated):
  confirm: true
  reason: string (optional)

Response 202:
  erasure_request_id: string
  estimated_completion: ISO8601
```

### `GET /api/v2/compliance/audit-export`
Export audit log for enterprise admins (V2-FR-TEAM-003). Requires `org:audit:export` permission scope.
```
Query:
  from: ISO8601
  to: ISO8601
  user_id: string (optional)
  job_id: string (optional)

Response 200:
  export_url: string (signed temporary URL)
  event_count: number
  expires_at: ISO8601
```

---

## 11. Telemetry Endpoint (V1)

### `POST /api/v1/telemetry/events`
Client-side metadata-only funnel events (V1-FR-ANA-003). Accepted for both V1 and V2 clients; route stays under `/api/v1/` as telemetry schema is backward-compatible.
```
Request:
  events:
    - event_name: string (e.g. "proposal_selected", "bdd_edited", "patch_accepted")
      properties: object (metadata only — NO source code, BDD text, prompt content)
      timestamp: ISO8601

Response 200:
  accepted: number
  rejected: number (0 if payload is clean)

# Server rejects batch silently if payload contains prohibited content
# When organizations.zero_telemetry_mode = true: request is accepted (200) but all behavior fields are silently dropped
```

---

## 12. Error Code Reference

All error responses follow this shape:
```json
{
  "error_code": "MACHINE_READABLE_CODE",
  "message": "Human-readable description",
  "detail": {} // optional structured context
}
```

Core error codes:
| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Auth failed |
| `TOKEN_EXPIRED` | 401 | JWT expired |
| `REFRESH_TOKEN_EXPIRED` | 401 | Refresh token expired |
| `FORBIDDEN` | 403 | Authenticated but not authorized |
| `JOB_OWNERSHIP_VIOLATION` | 403 | Accessing another user's job |
| `ENTITLEMENT_DENIED` | 403 | Feature not available on current tier |
| `ENTITLEMENT_INSUFFICIENT` | 403 | V2 cloud feature blocked for Free/Plus |
| `ENTITLEMENT_DENIED_PHASE` | 403 | Phase escalation blocked by tier |
| `QUOTA_EXCEEDED_DAILY` | 429 | Free tier 3/day limit hit |
| `QUOTA_EXCEEDED_MONTHLY` | 429 | Monthly quota exhausted |
| `QUOTA_RESERVATION_FAILED` | 409 | Could not reserve quota before start |
| `RATE_LIMITED` | 429 | API gateway rate limit |
| `SPEC_REVISION_CONFLICT` | 409 | Concurrent spec edit conflict |
| `REMOTE_HEAD_CONFLICT` | 409 | GitHub branch head changed since job start |
| `SYNC_APPLY_CONFLICT` | 409 | Local overlap prevents remote apply |
| `POST_COMMIT_REVERT_BLOCKED` | 409 | Revert not possible after VCS commit |
| `REPO_SIZE_LIMIT_EXCEEDED` | 422 | Repository too large for import |
| `PATH_SCOPE_REQUIRED` | 422 | No path scope set for repo import |
| `ESCALATION_CONFIRMATION_TIMEOUT` | 408 | Phase escalation timed out |
| `HEARTBEAT_SESSION_INVALID` | 404 | Heartbeat session not found or expired |
| `INSUFFICIENT_FUNDS` | 402 | Compute quota/billing exhausted mid-run |
| `ENTITLEMENT_ENTERPRISE_ONLY` | 403 | Enterprise feature on lower tier |
| `SIGNED_COMMIT_REQUIRED` | 422 | Branch protection requires signed commits |

---

## 13. Contract Invariants

Agents must not violate these invariants when implementing any endpoint:

1. **Idempotency**: `POST /webhooks/payment` and `POST /webhooks/github` must be fully idempotent.
2. **Ownership**: Every job endpoint verifies `job.owner_id == authenticated_user_id` before processing.
3. **Quota gate**: `POST /jobs/:job_id/start` must acquire quota reservation with distributed lock before returning 200.
4. **Denial reasons**: Every 403 response must include `error_code` and `denial_reason` as machine-readable fields.
5. **State transitions**: Endpoint actions must only trigger valid state transitions per Section 13 of V1 PRD.
6. **Heartbeat fields**: `GET /jobs/:job_id` always includes `heartbeat_status`, `last_heartbeat_at`, `grace_deadline_at`.
7. **Artifact expiry**: `GET /jobs/:job_id/delivery` always includes `artifact_expires_at`.
8. **Telemetry gate**: `POST /telemetry/events` server-side validates payload contains no source/BDD/SDD/prompt content.
9. **Draft PR default**: `POST /jobs/:job_id/delivery/github` must default `draft: true` regardless of client request.
10. **Provenance**: GitHub delivery response always includes `provenance.co_authored_by` and `provenance.job_id`.
11. **Revision tokens**: All spec update responses return a new `revision_token`; all spec update requests require the current `revision_token`.
12. **Phase gating**: LLM Router rejects phase escalation calls that exceed tier entitlement with `ENTITLEMENT_DENIED_PHASE`.
