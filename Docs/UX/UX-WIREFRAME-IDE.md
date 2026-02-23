# IAMA VS Code Extension — Wireframe Specification

Document ID: `IAMA-UX-WF-IDE-001`
Version: `1.0`
Status: `Approved for Design Implementation`
Audience: Design, Extension Frontend Developers
Depends on: `IAMA-UX-DS-001` (Design System)

---

## 1. Extension Layout

The extension uses a VS Code Webview inside the sidebar panel. The panel width is fixed by VS Code (typically 280–400px). All screen designs must work at 280px minimum width.

The panel renders as a single-page React application. Navigation between screens is state-driven (no browser history).

```
+----------------------------------+
| IAMA                [user] [...]  |  <- Header bar (fixed)
|----------------------------------|
|                                  |
|  [  SCREEN CONTENT  ]            |  <- Scrollable main area
|                                  |
|----------------------------------|
| [quota summary]  [settings icon]  |  <- Footer status bar (fixed)
+----------------------------------+
```

Header elements:
- `IAMA` wordmark (text only, no logo embellishment).
- User avatar placeholder: Lucide `CircleUser` icon.
- Overflow menu: Lucide `Ellipsis` icon.

Footer elements:
- Usage summary: `[Gauge icon] 12 / 50 runs used`.
- Settings: Lucide `Settings` icon.

---

## 2. Screen: Login Handoff

Triggered when: User has not authenticated, or session expired.

```
+----------------------------------+
| IAMA                              |
|----------------------------------|
|                                  |
|  Code refactoring with           |
|  strict safety controls.         |
|                                  |
|  [Lock icon]                     |
|                                  |
|  Sign in to start refactoring.   |
|  Your code stays on your         |
|  machine.                        |
|                                  |
|  +----------------------------+  |
|  |  [LogIn icon]  Sign in     |  |
|  +----------------------------+  |
|                                  |
|  --------------------------------|
|  Free tier available.            |
|  No credit card required.        |
|                                  |
+----------------------------------+
```

Behavior:
- "Sign in" opens browser-based OAuth flow. Extension monitors for callback.
- While waiting: button text changes to "Waiting for browser..." with Lucide `Loader2` spinner. No modal.
- On success: transition to Job Setup screen.
- On timeout (> 120s): show "Sign-in timed out. Try again." with retry button.

Notes:
- No AI mascot. No gradient hero.
- "Your code stays on your machine." is a key trust statement — must be visible above the fold.
- The `Lock` icon here carries a specific meaning: local privacy, not security-gate.

---

## 3. Screen: First-Run Setup (Execution Profile Selection)

Triggered when: User logs in for the first time, or resets execution profile.

```
+----------------------------------+
| IAMA              [CircleUser]   |
|----------------------------------|
|  EXECUTION PROFILE               |
|  Choose how tests will run.      |
|                                  |
|  +----------------------------+  |
|  | [ShieldCheck] Local Docker |  |
|  | RECOMMENDED                |  |
|  |                            |  |
|  | Runs tests in an isolated  |  |
|  | container. Safer — no risk |  |
|  | of affecting your system.  |  |
|  |                            |  |
|  | Requires: Docker Desktop   |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  | [Terminal]   Local Native  |  |
|  |                            |  |
|  | Runs tests directly on     |  |
|  | your machine. Compatible   |  |
|  | with all setups.           |  |
|  |                            |  |
|  | Note: Tests may write to   |  |
|  | your filesystem or DB.     |  |
|  +----------------------------+  |
|                                  |
|  [ArrowRight icon] Continue      |
|----------------------------------|
+----------------------------------+
```

Segment A behavior (non-technical users):
- "Local Docker" card is visually pre-selected (border highlight + "RECOMMENDED" badge).
- "Local Native" card uses amber note: Lucide `TriangleAlert` before "Note: Tests may write..."
- User can select either by clicking. Only one active at a time.
- "Continue" is disabled until a selection is made.
- If Docker is not detected: "Local Docker" card shows `TriangleAlert` "Docker not found on your system" in amber. Local Native becomes pre-selected.

Segment B behavior (technical users):
- Same layout. No functional difference — profile description is the same.
- Technical users can see this is Docker vs native process; they will understand immediately.

---

## 4. Screen: Job Setup and Target Selection

Triggered when: User is authenticated and profile is set; clicking "New Refactor Job".

```
+----------------------------------+
| IAMA              [CircleUser]   |
|----------------------------------|
|  NEW REFACTOR JOB                |
|                                  |
|  TARGET                          |
|  +----------------------------+  |
|  | [Folder]  src/config/      |  |
|  |           [Change]         |  |
|  +----------------------------+  |
|                                  |
|  FILES IN SCOPE  (12 files)      |
|  src/config/parser.py            |
|  src/config/loader.py            |
|  src/config/schema.py            |
|  ... [show all 12]               |
|                                  |
|  EXCLUDED BY .iamaignore  (3)    |
|  .env, secrets/, build/          |
|                                  |
|  PREFLIGHT                       |
|  [check] No dirty files          |
|  [check] No secret patterns      |
|  [warn]  Git: 2 untracked files  |
|                                  |
|  HOW WOULD YOU LIKE TO PROCEED?  |
|  (  ) Continue (safe mode)       |
|  (  ) Cancel                     |
|                                  |
|  [Play icon]  Start Analysis     |
+----------------------------------+
```

Segment A preflight text (no git terminology):
- "No unsaved edits" instead of "No dirty files".
- "2 files not tracked by version control" instead of "2 untracked files".
- Choices: `Continue (safe mode)` and `Cancel` only. No git actions.

Segment B preflight text:
- Show raw preflight output: git status summary, untracked file list.
- Options: `Continue`, `Stash changes and continue`, `Cancel`.

Notes:
- `.iamaignore` excluded files always visible and collapsed by default.
- "Start Analysis" is disabled if preflight yields a blocking error (secret detected).
- If Docker selected but not running: show inline warning with "Start Docker" deep-link (on macOS/Windows, links to Docker Desktop).
- Target selection uses VS Code file picker API — not a custom tree widget.

---

## 5. Screen: Strategy Proposal Selection

Triggered when: Job analysis completes and 3 proposals are ready.

```
+----------------------------------+
| [ArrowLeft] Analysis complete    |
|----------------------------------|
|  REFACTORING STRATEGY            |
|  Select an approach. You can     |
|  refine the spec afterward.      |
|                                  |
|  +-[SELECTED]------------------+ |
|  | Conservative                | |
|  | [■□□□□] LOW RISK            | |
|  |                             | |
|  | Renames and type            | |
|  | annotations only. No        | |
|  | control-flow changes.       | |
|  |                             | |
|  | Changes: 3 files            | |
|  | Estimated effort: Low       | |
|  | [show technical detail v]   | |
|  +-----------------------------+ |
|                                  |
|  +-[UNSELECTED]---------------+ |
|  | Standard                   | |
|  | [■■■□□] MEDIUM RISK        | |
|  | ...                        | |
|  +----------------------------+ |
|                                  |
|  +-[UNSELECTED]---------------+ |
|  | Comprehensive              | |
|  | [■■■■■] HIGH RISK          | |
|  | ...                        | |
|  +----------------------------+ |
|                                  |
|  [ArrowRight]  Use this strategy |
+----------------------------------+
```

Proposal card structure:
- Header: Strategy name (no tier language — not "Pro" or "Basic").
- Risk bar: 5-segment discrete bar (see Design System 6.2).
- Plain-language impact summary (2-3 sentences).
- Metadata: "Changes: N files", "Estimated effort: Low/Medium/High".
- Expandable section: technical risk detail (AST depth, dependency count, etc.) — Segment A users: hidden by default, labeled "Show technical detail".

Selection state:
- Selected card: border in `--color-status-info`, background slightly elevated.
- Unselected: default border, no fill.

Segment A constraint (V1-FR-UXA-003):
- Plain-language summary is the default visible content.
- Technical detail is behind `[show technical detail v]` expand control.
- Risk score bar is always visible — it is visual, not textual.

---

## 6. Screen: Spec Workbench (BDD + SDD Editor)

Triggered when: Strategy selected; user proceeds to spec review.

```
+----------------------------------+
| [ArrowLeft] Conservative         |
|----------------------------------|
|  SPEC WORKBENCH                  |
|                                  |
|  BEHAVIOR  (BDD)         [Edit]  |
|  ----------------------------    |
|  Given: a legacy config file     |
|    with deprecated keys          |
|  When: the parser loads it       |
|  Then: deprecated keys are       |
|    mapped to new schema and      |
|    warnings are logged           |
|                                  |
|  [+ Add behavior]                |
|                                  |
|  STRUCTURE  (SDD)       [Toggle] |
|  ----------------------------    |
|  [hidden by default, Segment A]  |
|                                  |
|  REVISION HISTORY        [Clock] |
|  v3 — You — 2 min ago            |
|  v2 — You — 8 min ago            |
|  v1 — System — 14 min ago        |
|                                  |
|  [CheckSquare]  Approve spec     |
|  [ArrowRight ]  Generate tests   |
+----------------------------------+
```

BDD editing:
- Click "Edit" to enter edit mode. Given/When/Then statements become editable text areas.
- Natural language input — no formal syntax required.
- System reformats input to structured BDD on save.
- Each BDD item can be deleted (Lucide `Trash2`, appears on hover) or reordered (drag handle, Lucide `GripVertical`).

SDD section (V1-FR-SPEC-004):
- For Segment A: hidden by default. "STRUCTURE (SDD) — [Show structure details]" collapsed.
- For Segment B: visible by default.
- SDD items show: component name, responsibility description, dependency list.

Revision history:
- Shows last 3 revisions with actor and timestamp.
- Click `[Clock]` icon to expand full revision list.
- Click any revision to compare with current (opens side-by-side diff within the workbench).

Expert Fast-Track (Segment B only, V1-FR-SPEC-005):
- Toggle labeled "Fast-Track" in panel header area, next to strategy name.
- When enabled: spec approval step is skipped; implicit specs are shown in collapsed section labeled "Auto-generated spec (Fast-Track)".
- A warning label appears: "Spec not manually reviewed. View below."

---

## 7. Screen: Execution Console

Triggered when: Spec approved and tests are generating.

```
+----------------------------------+
| [ArrowLeft] Conservative spec v3 |
|----------------------------------|
|  EXECUTION                       |
|                                  |
|  STAGE PROGRESS                  |
|  [check]  Spec approved      v3  |
|  [check]  Tests generated    12  |
|  [spin ]  Baseline validation    |
|           Running... 18s         |
|  [clock]  Refactoring         —  |
|  [clock]  Self-healing        —  |
|                                  |
|  ATTEMPT LOG                     |
|  --------------------------      |
|  10:14:22  Baseline: test_1 OK   |
|  10:14:23  Baseline: test_2 OK   |
|  10:14:24  Baseline: test_3 FAIL |
|            AssertionError: ...   |
|  [Load more]                     |
|                                  |
|  MODEL ROUTE                     |
|  Phase 1  claude-haiku-class     |
|  Advanced quota: 48/50 remaining |
|                                  |
|  [Square]  Cancel job            |
+----------------------------------+
```

Stage progress:
- Completed stages: Lucide `CircleCheck` in `--color-status-success`.
- Active stage: Lucide `Loader2` (spinning) in `--color-status-info`.
- Pending stages: Lucide `Clock` in `--color-text-muted`.
- Each completed stage shows relevant count or version number.

Attempt log:
- Timestamped log stream. Monospace font (`--text-code`).
- Color codes: errors in `--color-status-danger`, warnings in `--color-status-warning`, success in `--color-status-success`.
- Auto-scrolls to bottom while job is active. Scroll-lock pauses auto-scroll (Lucide `Pin` icon appears when locked).
- "Load more" loads previous log lines (not auto-loaded to avoid performance issues with large logs).

Model route:
- Shows current phase and model class (not exact model version string).
- Shows remaining advanced quota if phase escalation is possible.

Self-healing counter (appears when SELF_HEALING state active):
```
|  [RefreshCw]  Repair attempt 3 / 10  |
|  Last failure: test_config_load       |
```

Execution console also shows Deep Fix active state (when `DEEP_FIX_ACTIVE`):
```
|  DEEP FIX ACTIVE                     |
|  [Brain icon] Context reset           |
|  Re-analyzing from first principles  |
|  Model: claude-opus-class (upgraded) |
```

---

## 7B. Screen: Waiting Intervention — Identical Failure Threshold Reached

Triggered when: Same failure pattern occurs 3 consecutive times in `SELF_HEALING`.

Replaces the self-healing counter in the Execution Console:

```
+----------------------------------+
| [ArrowLeft] Conservative spec v3 |
|----------------------------------|
|  EXECUTION                       |
|                                  |
|  +----------------------------+  |
|  | [TriangleAlert]            |  |  <- amber border
|  | Same issue repeated 3x     |  |
|  |                            |  |
|  | test_parse_legacy_config   |  |
|  | AssertionError: encoding   |  |
|  |                            |  |
|  | What would you like to do? |  |
|  |                            |  |
|  | [Zap]  Deep Fix            |  |
|  | Context reset, rewrite     |  |
|  | from scratch               |  |
|  | (auto-upgrades model)      |  |
|  |                            |  |
|  | [Wrench]  Intervene        |  |
|  | Take manual control        |  |
|  |                            |  |
|  | [ArrowRight] Continue      |  |
|  | standard repair            |  |
|  | (3 retries remaining)      |  |
|  +----------------------------+  |
+----------------------------------+
```

Deep Fix button note: Shows model upgrade info relevant to user's tier:
- Free/Plus: "Deep Fix (no auto-upgrade — 1 advanced run will be used)"
- Pro/Max/Enterprise: "Deep Fix (auto-upgrades to [opus-class])"

---

## 7C. Screen: User Intervening — Manual and Agentic Repair

Triggered when: User selects "Intervene" from `WAITING_INTERVENTION`.

```
+----------------------------------+
| [ArrowLeft] Intervening          |
|----------------------------------|
|  MANUAL CONTROL                  |
|                                  |
|  FAILING TEST                    |
|  test_parse_legacy_config        |
|  AssertionError: expected utf-8  |
|  at src/config/parser.py:42      |
|  [view in editor]                |
|                                  |
|  You can:                        |
|  1. Edit the code in VS Code     |
|     then click Run Tests         |
|  2. Instruct the AI below        |
|                                  |
|  [Play] Run Tests                |
|  [X]    Exit intervene mode      |
|                                  |
|  INSTRUCT THE AI                 |
|  ─────────────────────────────   |
|  > [_________________________]   |
|  ─────────────────────────────   |
|  using: claude-sonnet-class      |
|                                  |
|  LAST COMMAND RESULT             |
|  [No commands yet]               |
+----------------------------------+
```

After a command is run:
```
|  LAST COMMAND RESULT             |
|  cmd: "fix encoding in parser"   |
|  ─────────────────────────────   |
|  Applied: parser.py (2 changes)  |
|  ─────────────────────────────   |
|  [check] test_parse_...  PASSED  |
|  [check] test_migrate_.. PASSED  |
|  [fail ] test_edge_case  FAILED  |
|  ─────────────────────────────   |
|  [View diff] [Run tests again]   |
```

When all failing tests pass:
- "Resume refactoring" button appears.
- Clicking resumes the workflow from the point of intervention.

"View in editor": opens the failing file in VS Code at the failing line using VS Code `openTextDocument` API.

---

## 8. Screen: Heartbeat Disconnect — Grace Period UI

Triggered when: IDE heartbeat is lost (V1-FR-JOB-007).

Replaces the active stage progress section in the Execution Console:

```
+----------------------------------+
| [ArrowLeft] Conservative spec v3 |
|----------------------------------|
|  EXECUTION                       |
|                                  |
|  +----------------------------+  |
|  | [WifiOff]                  |  |
|  | Connection lost            |  |  <- amber border
|  |                            |  |
|  | Job paused. Reconnecting.  |  |
|  | Resuming in  4:43          |  |  <- countdown mm:ss
|  |                            |  |
|  | Cloud token generation     |  |
|  | is paused.                 |  |
|  |                            |  |
|  | [OctagonX] Force terminate |  |  <- destructive, red text
|  +----------------------------+  |
|                                  |
|  STAGE PROGRESS                  |
|  [check]  Spec approved      v3  |
|  [check]  Tests generated    12  |
|  [pause]  Baseline validation    |
|           Paused               |  |
+----------------------------------+
```

Countdown display:
- `mm:ss` format. Updates every second.
- No progress bar — only text countdown (avoids falsely conveying progress during a disconnect).
- Panel border: left border in `--color-status-warning` (amber).

Force terminate:
- Lucide `OctagonX` icon in `--color-status-danger`.
- Clicking "Force terminate" shows confirmation modal:
  ```
  Terminate this job?
  The current attempt will be discarded.
  Partial artifacts will be preserved.
  [Terminate] [Keep waiting]
  ```
- "Terminate" button: filled `--color-status-danger` background.

If reconnected within grace window:
- Dismiss the disconnect panel.
- Stage progress resumes with `--color-status-info` active stage.
- Log stream continues.

If grace window expires (300s):
- Panel updates:
  ```
  | [XCircle] Job terminated           |
  | Connection was not restored in     |
  | 5 minutes. Job has ended safely.   |
  |                                    |
  | Partial artifacts preserved.       |
  | [Download partial artifact]        |
  | [Report this]                      |
  ```

---

## 9. Screen: Delivery Diff View

Triggered when: Job state transitions to `DELIVERED`.

```
+----------------------------------+
| [ArrowLeft] Refactor complete    |
|----------------------------------|
|  DELIVERY                        |
|  3 files changed                 |
|  Conservative strategy v3        |
|                                  |
|  BASELINE                        |
|  [ShieldCheck] Assertion-based   |
|  All 12 tests passed             |
|                                  |
|  CHANGES                         |
|  [v] src/config/parser.py  +/-   |
|  |  @@ -42,7 +42,12 @@           |
|  |  -  def parse_config(f):      |
|  |  +  def parse_config(         |
|  |  +      file: Path) -> Config:|
|  |  ...                          |
|  [>] src/config/loader.py  +/-   |
|  [>] src/config/schema.py  +/-   |
|                                  |
|  SELECTION                       |
|  [x] parser.py                   |
|  [x] loader.py                   |
|  [ ] schema.py  (deselected)     |
|                                  |
|  Expires: Mar 7 2026, 14:22      |
|  [Download reverse patch]        |
|                                  |
|  [GitMerge]  Apply 2 files       |
|  [Undo2]     Discard             |
+----------------------------------+
```

Diff view behavior:
- Each file section is collapsible (`[v]` open / `[>]` closed).
- Hunk headers show `@@ -line,count +line,count @@`.
- Segment B/C: checkbox per hunk for partial selection.
- Segment A: checkbox per file only.
- Deselected items: dimmed, line-through on file name. Still visible (not hidden).

Baseline mode display (V1-FR-TEST-007):
- Always shows which baseline mode passed.
- If characterization baseline: amber `[ShieldAlert] Characterization baseline (snapshot)` with expand to see snapshot details.

Complexity warning for Segment A (V1-FR-DEL-006):
- If high-complexity changes detected, a blocking panel appears before the Apply button:
  ```
  +----------------------------+
  | [TriangleAlert] Review     |
  | These changes include      |
  | complex logic rewrites.    |
  |                            |
  | Please read the changes    |
  | carefully before applying. |
  |                            |
  | [I have reviewed — Apply]  |
  | [Cancel]                   |
  +----------------------------+
  ```
  Apply is blocked until this confirmation is completed. Confirmation is audit-logged.

Artifact expiry (V1-FR-DEL-008):
- Always visible near the bottom: "Expires: [date]".
- If within 48 hours of expiry: amber `[TriangleAlert] Artifacts expire in 36 hours.`

Revert action (V1-FR-DEL-007):
- Available in job detail view after apply.
- If post-commit VCS state detected: "Revert" button replaced by "[Download Reverse Patch]" with amber warning: "Changes have been committed to version control. Download the reverse patch to undo manually."

---

## 10. Screen: Fallback Intervention Workspace

Triggered when: Job state transitions to `FALLBACK_REQUIRED` (total retry budget exhausted).

```
+----------------------------------+
| [ArrowLeft] Refactor stalled     |
|----------------------------------|
|  INTERVENTION REQUIRED           |
|  10 / 10 total attempts used     |
|                                  |
|  FAILURE EVIDENCE          [v]   |
|  test_parse_config               |
|    AssertionError: expected       |
|    'utf-8' got 'ascii'           |
|  test_schema_migration           |
|    AttributeError: 'NoneType'    |
|    has no attribute 'keys'       |
|                                  |
|  LAST PATCH SUMMARY         [v]  |
|  Attempted: Rewrite parse()      |
|  Applied to: parser.py           |
|  Result: 2 tests failed          |
|                                  |
|  ACTIONS                         |
|                                  |
|  [Zap]       Deep Fix            |
|  Context reset, rewrite from     |
|  scratch (auto-upgrades model)   |
|                                  |
|  [Wrench]    Intervene           |
|  Manual edit or instruct AI      |
|                                  |
|  [PencilLine] Edit spec          |
|  and retry from spec stage       |
|                                  |
|  [Download] Download partial     |
|  artifact                        |
|                                  |
|  [Bug] Report this failure       |
|                                  |
|  [Undo2] Close and restore       |
|  workspace                       |
|                                  |
|  INSTRUCT THE AI (optional)      |
|  ────────────────────────────    |
|  > [________________________]    |
|  ────────────────────────────    |
|  using: claude-sonnet-class      |
|  [No previous commands]          |
+----------------------------------+
```

Structure rules:
- Primary interaction layer: labeled action buttons at top. Natural language command panel is secondary, scrolled to or visible below.
- "Deep Fix": triggers `DEEP_FIX_ACTIVE` — context purge, re-analysis, auto-model-upgrade. After Deep Fix completes, workflow resumes with a fresh attempt counter. If Deep Fix patch still fails, returns to `WAITING_INTERVENTION`.
- "Intervene": transitions to `USER_INTERVENING` mode (Screen 7C).
- "Edit spec and retry": transitions to Spec Workbench (same job ID, `WAITING_SPEC_APPROVAL`).
- "Download partial artifact": downloads the last generated patch even if incomplete.
- "Report this failure": opens support ticket flow with pre-filled job ID (V1-FR-SUP-002).
- "Close and restore workspace": workspace restore action, always available.
- Command panel: natural language instruction input (see Design System 6.8). Result shown as structured outcome block. No conversation history. Available at all times in this screen.
- "Retry with stronger model" is NOT a separate button — model escalation happens automatically in Deep Fix or can be manually triggered via the escalation policy. Keeping the button list simple avoids choice paralysis.

Baseline blocker variant (BASELINE_VALIDATION_FAILED):
```
|  BASELINE FAILED                 |
|  Tests do not pass on your       |
|  existing code before refactoring|
|  began.                          |
|                                  |
|  WHAT WOULD YOU LIKE TO DO?      |
|                                  |
|  [PencilLine] Revise spec        |
|  and retry baseline              |
|                                  |
|  [Shield] Use snapshot           |
|  baseline instead                |  <- quarantine/mock override for Segment B
|                                  |
|  [Undo2] Cancel job              |
```

---

## 11. Screen: Usage Summary Drawer

Triggered when: User clicks usage area in footer.

Opens as a bottom drawer (not a full screen):

```
+----------------------------------+
|  USAGE THIS PERIOD               |
|  Resets Mar 1, 2026              |
|                                  |
|  Advanced runs                   |
|  [=========---------] 24 / 50   |
|                                  |
|  Jobs                            |
|  [====--------------]  8 / 20   |
|                                  |
|  [CreditCard] Upgrade plan       |
|  [ExternalLink] View billing     |
|                                  |
|  MODEL ROUTE USED                |
|  Phase 1 (base)   8 jobs         |
|  Phase 2 (adv)   16 jobs         |
|  Phase 3 (prem)   0 jobs         |
|                                  |
|  [X] Close                       |
+----------------------------------+
```

Usage bar:
- Horizontal progress bar, filled from left.
- At 80%: bar fills with `--color-status-warning` (amber).
- At 100%: bar fills with `--color-status-danger` (red) and "Quota exhausted" label.

---

## 12. Navigation Flow Diagram

```
Login
  |
  v
First-Run Setup (profile selection)
  |
  v
Job Setup + Target Selection
  |
  +-- [preflight fails] --> Error state in Job Setup
  |
  v
Strategy Proposal Selection
  |
  v
Spec Workbench
  |
  +-- [Expert Fast-Track] --> skips approval, shows auto-spec
  |
  v
Execution Console
  |
  +-- [heartbeat lost] --> Grace Period UI
  |         |
  |         +-- [reconnected] --> back to Execution Console
  |         +-- [timeout] --> Job Failed
  |         +-- [force terminate] --> Job Failed
  |
  +-- [DELIVERED] --> Delivery Diff View
  |         |
  |         +-- [apply] --> workspace updated, Revert action available
  |
  +-- [BASELINE_VALIDATION_FAILED] --> Fallback (baseline variant)
  |         |
  |         +-- [Revise spec] --> Spec Workbench (same job)
  |
  +-- [WAITING_INTERVENTION] --> Waiting Intervention Screen (7B)
  |         |
  |         +-- [Deep Fix] --> Deep Fix Active (in Execution Console) --> SELF_HEALING (reset counter)
  |         +-- [Intervene] --> User Intervening Screen (7C)
  |         |         |
  |         |         +-- [tests pass] --> Execution Console resumes
  |         +-- [Continue] --> Execution Console (retries continue)
  |
  +-- [FALLBACK_REQUIRED] --> Fallback Intervention Workspace (10)
            |
            +-- [Deep Fix] --> Deep Fix Active --> SELF_HEALING (fresh counter)
            +-- [Intervene] --> User Intervening Screen (7C)
            +-- [Edit spec] --> Spec Workbench (same job)
            +-- [Restore] --> Job Setup
            +-- [Natural language command] --> runs repair in-place, shows result
```

---

## 13. Key Design Rules (Enforcement Checklist)

Before shipping any IDE screen, verify:

- [ ] No chat bubble layout as primary interaction anywhere. (Natural language command panel in intervention screens is acceptable and required — it must use command panel pattern, not messenger pattern.)
- [ ] Every active state shows elapsed time or attempt count — no blank spinners.
- [ ] Every state badge has icon + text — no color-only indicators.
- [ ] Intervention screens have labeled action buttons as primary layer + natural language command panel as secondary.
- [ ] Command panel results are structured blocks (diff + test list), not text paragraphs.
- [ ] Waiting Intervention screen shows identical-failure count and offers Deep Fix + Intervene + Continue.
- [ ] Deep Fix active state shows "Context reset" + model upgrade indicator.
- [ ] Segment A screens: no git terminology, no raw VCS output, no technical risk scores above the fold.
- [ ] Heartbeat disconnect shows countdown timer and "Force Terminate" option.
- [ ] Delivery screen shows artifact expiry date.
- [ ] Complexity warning for Segment A blocks apply until confirmed.
- [ ] Baseline mode badge always visible in delivery screen.
- [ ] All icons are from Lucide or approved custom SVG — no emoji substitutes.
- [ ] Enterprise accounts: analysis phase shows Enterprise Analysis Report download before strategy selection.
