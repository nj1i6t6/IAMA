# IAMA Web Portal — Wireframe Specification

Document ID: `IAMA-UX-WF-WEB-001`
Version: `1.0`
Status: `Approved for Design Implementation`
Audience: Design, Web Frontend Developers
Depends on: `IAMA-UX-DS-001` (Design System)
Scope: V1 web portal screens + V2 web workspace screens

---

## 1. Web Layout System

The web portal uses a standard two-column layout for authenticated views:

```
+----------------------------------------------------------+
| [IAMA wordmark]  [nav items]        [user] [quota badge] |  <- Top nav (fixed)
+------------------+---------------------------------------+
|                  |                                       |
|  LEFT SIDEBAR    |  MAIN CONTENT AREA                    |
|  (240px fixed)   |  (fluid, min 640px)                   |
|                  |                                       |
|  Navigation      |                                       |
|  links           |                                       |
|                  |                                       |
+------------------+---------------------------------------+
```

Top nav elements:
- `IAMA` wordmark (text, no logo embellishment).
- Navigation items: `Jobs`, `Usage`, `Billing`, `Docs`.
- Right: user avatar (Lucide `CircleUser`) + plan badge + notification bell (Lucide `Bell`).

Left sidebar navigation:
- Active item: left border highlight (`--color-status-info`), background tint.
- Items: `Jobs`, `Usage`, `Billing`, `Security`, `Organization` (if in org context).

---

## 2. Screen: Sign In / Register (Public)

```
+----------------------------------------------------------+
| IAMA                                                     |
+----------------------------------------------------------+
|                                                          |
|              +-------------------------------+           |
|              | Sign in                       |           |
|              |                               |           |
|              | Email                         |           |
|              | [________________________]    |           |
|              |                               |           |
|              | Password                      |           |
|              | [________________________]    |           |
|              |                               |           |
|              | [LogIn]  Sign in              |           |
|              |                               |           |
|              | ─── or ───                    |           |
|              |                               |           |
|              | [Github icon SVG]  GitHub     |           |
|              |                               |           |
|              | Don't have an account?        |           |
|              | Register                      |           |
|              +-------------------------------+           |
|                                                          |
|  Your code is processed locally.                         |
|  IAMA does not store your source files.                  |
+----------------------------------------------------------+
```

Notes:
- GitHub OAuth login uses GitHub's official brand SVG (not Lucide — GitHub is not in Lucide).
- The privacy statement below the card is not a footnote — it is a content element.
- Register view: same card, different fields (email, password, confirm password).
- No decorative illustration. No gradient background.

---

## 3. Screen: Plan and Billing

```
+------------------+---------------------------------------+
| Jobs             |  PLAN AND BILLING                    |
| Usage            |                                       |
| > Billing        |  CURRENT PLAN                         |
| Security         |  +-----------------------------------+|
|                  |  | Pro                               ||
|                  |  | $29 / month                      ||
|                  |  | Next renewal: Mar 1, 2026         ||
|                  |  |                                   ||
|                  |  | [CreditCard]  Manage billing      ||
|                  |  | [ArrowUp]     Upgrade to Max      ||
|                  |  +-----------------------------------+|
|                  |                                       |
|                  |  PLAN ENTITLEMENTS                    |
|                  |  Advanced model runs   50 / month     |
|                  |  Context tokens        128K / request |
|                  |  Job history           90 days        |
|                  |  Execution mode        Local only     |
|                  |                                       |
|                  |  USAGE THIS PERIOD                    |
|                  |  Advanced runs                        |
|                  |  [==========---------] 24 / 50        |
|                  |                                       |
|                  |  Total jobs                           |
|                  |  [====--------------]  8 / unlimited  |
|                  |                                       |
|                  |  RECENT INVOICES                      |
|                  |  Feb 2026  $29.00   [Download]        |
|                  |  Jan 2026  $29.00   [Download]        |
+------------------+---------------------------------------+
```

Notes:
- Entitlement table is a plain table, not cards with icons. Engineering-grade information density.
- Usage bars: same semantic color behavior as IDE (amber at 80%, red at 100%).
- "Manage billing" opens Stripe Customer Portal (external link — Lucide `ExternalLink` icon).

---

## 4. Screen: Job History and Audit Viewer

```
+------------------+---------------------------------------+
| > Jobs           |  JOBS                                 |
| Usage            |                                       |
| Billing          |  FILTER                               |
| Security         |  Status: [All v]  Period: [30 days v] |
|                  |                                       |
|                  |  +-----------------------------------+|
|                  |  | DELIVERED    src/config/          ||
|                  |  | Conservative · v3 · 3 files       ||
|                  |  | Feb 20, 10:14  · 4m 22s           ||
|                  |  | [PackageCheck]  [View]  [Revert]  ||
|                  |  +-----------------------------------+|
|                  |                                       |
|                  |  +-----------------------------------+|
|                  |  | FALLBACK     src/api/             ||
|                  |  | Standard · v2 · 7 files           ||
|                  |  | Feb 19, 15:03  · 18m 41s          ||
|                  |  | [TriangleAlert] [View]            ||
|                  |  +-----------------------------------+|
|                  |                                       |
|                  |  +-----------------------------------+|
|                  |  | FAILED       src/db/              ||
|                  |  | Comprehensive · v1 · 12 files     ||
|                  |  | Feb 18, 09:22  · 24m 05s          ||
|                  |  | [XCircle]      [View]             ||
|                  |  +-----------------------------------+|
|                  |                                       |
|                  |  Showing 3 of 8 jobs                  |
|                  |  [Load more]                          |
+------------------+---------------------------------------+
```

Job row structure:
- Status badge: icon + text (consistent with IDE Design System).
- Target path: folder scope of the job.
- Strategy + spec version + file count.
- Timestamp + duration.
- Actions: `[View]` opens job detail. `[Revert]` only if DELIVERED and within session.

Job detail panel (opens when clicking View):
- Full state timeline from `PENDING` to terminal.
- Spec revision history.
- Test results list.
- Artifact list with expiry dates.
- Audit event log (actor, state, timestamp).

---

## 5. Screen: Account Security

```
+------------------+---------------------------------------+
| Jobs             |  SECURITY                             |
| Usage            |                                       |
| Billing          |  SESSION                              |
| > Security       |  Current session active               |
|                  |  Started: Feb 22, 09:14 (this device) |
|                  |  [LogOut]  Sign out all sessions       |
|                  |                                       |
|                  |  PASSWORD                             |
|                  |  [KeyRound]  Change password           |
|                  |                                       |
|                  |  DATA AND PRIVACY                     |
|                  |  [EyeOff]  Request account deletion   |
|                  |  Your data will be deleted within     |
|                  |  30 days. This cannot be undone.      |
|                  |                                       |
|                  |  TELEMETRY                            |
|                  |  Funnel tracking: [Enabled v]         |
|                  |  Behavioral data is metadata only.    |
|                  |  No source code is included.          |
+------------------+---------------------------------------+
```

---

## V2 Screens

---

## 6. Screen: GitHub Connection and Repository Picker (V2)

```
+------------------+---------------------------------------+
| > Jobs           |  CONNECT REPOSITORY                   |
| Usage            |                                       |
| Billing          |  GITHUB ACCOUNT                       |
| Security         |  +-----------------------------------+|
|                  |  | [Github SVG]  your-username        ||
|                  |  | Connected · 12 repositories        ||
|                  |  | Scope: repo (read), contents:read  ||
|                  |  | [Revoke access]                    ||
|                  |  +-----------------------------------+|
|                  |                                       |
|                  |  SELECT REPOSITORY                    |
|                  |  [Search repositories...]             |
|                  |                                       |
|                  |  your-org/legacy-service  [Select]    |
|                  |  your-org/api-gateway     [Select]    |
|                  |  your-username/config-lib [Select]    |
|                  |                                       |
|                  |  BRANCH AND PATH SCOPE                |
|                  |  Branch: [main              v]        |
|                  |  Path:   [src/config/       ]         |
|                  |                                       |
|                  |  REPO LIMITS                          |
|                  |  [check] Size: 48 MB / 500 MB limit   |
|                  |  [check] Files: 312 / 10,000 limit    |
|                  |  [check] Path scope specified         |
|                  |                                       |
|                  |  [ArrowRight]  Start analysis         |
+------------------+---------------------------------------+
```

Repo limits:
- Size and file count displayed as progress bars (same pattern as usage).
- If over limit: `[XCircle]` in red, line shows "Over limit — narrow your path scope".
- "Start analysis" is blocked until repo limits pass.

Revoke access:
- Opens confirmation dialog:
  ```
  Revoke GitHub access?
  Any in-progress syncs will be stopped.
  You can reconnect at any time.
  [Revoke] [Cancel]
  ```

---

## 7. Screen: Web Refactor Workspace (V2)

The web workspace replaces the IDE for paid users doing GitHub-based refactoring. Layout is three-column during execution:

```
+------------------+--------------------+------------------+
|  LEFT SIDEBAR    |  EXECUTION CENTER  |  DETAIL PANEL    |
|  (220px)         |  (fluid)           |  (300px)         |
|                  |                    |                  |
|  Job context:    |  STAGE PROGRESS    |  SPEC            |
|  Repo/branch     |  [check] Synced    |  Conservative v3 |
|  Strategy        |  [check] Spec OK   |                  |
|  Execution mode  |  [spin ] Testing   |  EXECUTION MODE  |
|  ─────────       |         24s...     |  Server sandbox  |
|  Navigation:     |                    |  [ShieldCheck]   |
|  Spec            |  ATTEMPT LOG       |  Isolated        |
|  Execution       |  10:14 test_1 OK   |                  |
|  Delivery        |  10:14 test_2 OK   |  NETWORK MODE    |
|  Artifacts       |  10:14 test_3 FAIL |  [WifiOff] Mocked|
|                  |  [load more]       |  external calls  |
|                  |                    |                  |
|  EXECUTION MODE  |  MODEL ROUTE       |  BRANCH          |
|  Server sandbox  |  Phase 1 base      |  main            |
|  [ShieldCheck]   |  48/50 remaining   |  [GitBranch]     |
|  Mocked network  |                    |  HEAD: a1b2c3d   |
+------------------+--------------------+------------------+
```

Left sidebar (persistent throughout job):
- Repository path and branch always visible.
- Strategy name and spec version always visible.
- Execution mode badge (Local / Server sandbox).
- Navigation links within the job context (Spec / Execution / Delivery / Artifacts).

Execution center:
- Same stage progress pattern as IDE.
- Attempt log: same monospace, timestamped, color-coded pattern.
- Model route and quota visible.

Detail panel:
- Shows spec summary (collapsible), execution mode, network mode, branch info.
- During self-healing: shows repair attempt counter.

Network mode badge:
- `[WifiOff] Mocked external calls` — during test/execution stage (deny-by-default).
- `[Wifi] Build egress: package mirrors only` — during dependency build stage.
- `[TriangleAlert] Enterprise FQDN allowlist active` — if org has allowlist enabled.

---

## 8. Screen: Delivery and PR Creation (V2)

```
+------------------+---------------------------------------+
|  Job context     |  DELIVERY                             |
|  (left sidebar)  |                                       |
|                  |  [PackageCheck] Refactor complete     |
|                  |  Conservative · 3 files changed       |
|                  |                                       |
|                  |  BASELINE                             |
|                  |  [ShieldCheck] Assertion-based        |
|                  |  12/12 tests passed                   |
|                  |                                       |
|                  |  DIFF REVIEW                          |
|                  |  [v] src/config/parser.py   +12 -7   |
|                  |  | @@ -42,7 +42,12 @@               |
|                  |  | - def parse_config(f):            |
|                  |  | + def parse_config(               |
|                  |  | +     file: Path) -> Config:      |
|                  |  [>] src/config/loader.py   +3  -1   |
|                  |  [>] src/config/schema.py   +8  -4   |
|                  |                                       |
|                  |  DELIVERY METHOD                      |
|                  |  ( ) Create pull request (Draft)      |
|                  |      Branch: refactor/config-202602   |
|                  |      [Change name]                    |
|                  |  ( ) Download patch bundle            |
|                  |  ( ) Open in IDE  [ExternalLink]      |
|                  |                                       |
|                  |  PR PROVENANCE                        |
|                  |  Co-authored-by: IAMA-Agent           |
|                  |  References job: job_abc123           |
|                  |                                       |
|                  |  Expires: Mar 7 2026, 14:22           |
|                  |                                       |
|                  |  [GitPullRequest]  Create Draft PR    |
|                  |  [Download]        Download bundle    |
+------------------+---------------------------------------+
```

Delivery method selection:
- Radio buttons. "Create pull request (Draft)" is default selected.
- PR name auto-generated: `refactor/{scope}-{date}`. User can override.
- "Open in IDE": Lucide `ExternalLink`. Clicking triggers `Sync Remote Job` in the extension.

PR provenance section:
- Always visible when PR delivery is selected.
- Non-editable. Shows exact metadata that will appear in the PR.

After PR created:
- Panel updates:
  ```
  Pull request created.
  [GitPullRequest] open PR (#42) [ExternalLink]

  Branch: refactor/config-202602
  Job: job_abc123

  [View PR details]
  ```

---

## 9. Screen: Sync Conflict Resolution Workbench (V2)

Triggered when: `Sync Remote Job` apply detects local overlap conflict.

```
+----------------------------------------------------------+
| IAMA                                                     |
+----------------------------------------------------------+
|  SYNC CONFLICT                                           |
|  Job job_abc123 · src/config/                            |
|                                                          |
|  +----------------------------------------------------+  |
|  | [TriangleAlert]                                    |  |
|  | Local files have changes that overlap with this   |  |
|  | remote job's diff.                                |  |  <- Segment A copy
|  |                                                   |  |
|  | Please save or discard your local changes         |  |
|  | before applying this refactor.                    |  |  <- Segment A only
|  +----------------------------------------------------+  |
|                                                          |
|  CONFLICTING FILES        (Segment B/C view)             |
|  src/config/parser.py                                    |
|    Remote: 12 lines changed                              |
|    Local:  3 uncommitted changes                         |
|    [Diff icon] View conflict                             |
|                                                          |
|  RESOLVE OPTIONS          (Segment B/C only)             |
|                                                          |
|  [GitMerge] Three-way merge                              |
|  Review and resolve conflicts interactively              |
|                                                          |
|  [RotateCw]  Stash local, apply, restore                 |
|  Auto-stash your changes, apply remote diff,             |
|  then restore your stash with conflict markers           |
|                                                          |
|  [X] Cancel sync                                         |
|                                                          |
+----------------------------------------------------------+
```

Segment A view:
- Only shows the plain-language warning block.
- Only shows "Cancel sync" button.
- No conflict file list, no merge options, no git terminology.

Segment B/C view:
- Shows conflict file list with per-file diff inspection.
- Shows resolve options: three-way merge or auto-stash-apply-pop.
- After resolving: "Apply now" button appears.
- No silent overwrite path — user must explicitly confirm.

---

## 10. Screen: Team and Role Settings (V2 Enterprise)

```
+------------------+---------------------------------------+
| Jobs             |  TEAM SETTINGS                        |
| Usage            |  legacy-service project               |
| Billing          |                                       |
| Security         |  MEMBERS                              |
| > Team           |  +-----------------------------------+|
|                  |  | alice@corp.com    Admin    [Edit] ||
|                  |  | bob@corp.com      Developer [Edit]||
|                  |  | carol@corp.com    Viewer   [Edit] ||
|                  |  +-----------------------------------+|
|                  |  [UserPlus]  Invite member            |
|                  |                                       |
|                  |  POLICY SETTINGS                      |
|                  |  Allowed models: [claude-sonnet v]    |
|                  |  Execution mode: [Server sandbox v]   |
|                  |  PR default: [Draft v]                |
|                  |  Zero Telemetry: [Enabled v]          |
|                  |                                       |
|                  |  AUDIT                                |
|                  |  [FileCheck2]  Export audit log       |
|                  |  Period: [Last 90 days v]             |
|                  |  Format: [CSV v]                      |
|                  |  [Download]                           |
+------------------+---------------------------------------+
```

Policy settings:
- Dropdowns for org-level defaults.
- Zero Telemetry toggle: when enabled, shows amber confirmation before save: "Disabling telemetry means IAMA cannot measure feature adoption for your org. Confirm?"

---

## 11. Screen: Usage Analytics (V1 + V2)

```
+------------------+---------------------------------------+
| Jobs             |  USAGE ANALYTICS                      |
| > Usage          |  Current billing period               |
| Billing          |                                       |
| Security         |  ADVANCED RUNS                        |
|                  |  24 used / 50 included                |
|                  |  [bar chart: 24/50]                   |
|                  |                                       |
|                  |  BY STATUS                            |
|                  |  Delivered       18                   |
|                  |  Fallback         4                   |
|                  |  Failed           2                   |
|                  |                                       |
|                  |  BY MODEL PHASE                       |
|                  |  Phase 1 only    12                   |
|                  |  Phase 2 used    10                   |
|                  |  Phase 3 used     2                   |
|                  |                                       |
|                  |  [V2 only]                            |
|                  |  SERVER SANDBOX COMPUTE               |
|                  |  142 minutes used this period         |
|                  |  [bar chart]                          |
|                  |                                       |
|                  |  Included: 200 min/month              |
|                  |  Overage: 0 min                       |
+------------------+---------------------------------------+
```

Notes:
- Bar charts are simple horizontal bar charts with count labels — not pie charts, not donut charts.
- No decorative chart styles. No gradient fills.
- V2 sandbox usage section only shows for paid tiers with server sandbox access.

---

## 12. Design Enforcement Checklist (Web)

Before shipping any web screen, verify:

- [ ] No chat bubble layout or conversational UI patterns.
- [ ] Top nav and left sidebar present on all authenticated screens.
- [ ] Repository and branch context always visible during V2 web workspace jobs.
- [ ] Stage map visible during execution — no blank "processing" states.
- [ ] Conflict warning blocks apply without free-text resolution path for Segment A.
- [ ] PR provenance fields always shown when PR delivery is selected.
- [ ] Default PR creation is Draft — non-draft requires explicit selection.
- [ ] Audit export available to enterprise admin from Team settings.
- [ ] All icons from Lucide or approved SVG (GitHub brand SVG acceptable for GitHub connect).
- [ ] No emoji in any functional UI text.
- [ ] Color contrast passes 4.5:1 minimum.
- [ ] Telemetry toggle visible in both account security and team settings.
