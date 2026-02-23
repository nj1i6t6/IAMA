# IAMA UX Design System

Document ID: `IAMA-UX-DS-001`
Version: `1.0`
Status: `Approved`
Audience: Design, Frontend, Extension Developers

---

## 1. Design Philosophy

IAMA is an engineering tool for code transformation. Every visual and interaction decision must reinforce this:

- **Evidence first, generated text second.** State indicators, test results, risk scores, and patch diffs have more visual weight than LLM-generated narrative.
- **Precision over decoration.** Typography communicates hierarchy without ornament. Color carries semantic meaning, not brand aesthetics.
- **Distrust the generic.** Any screen that could exist in a generic SaaS template has failed the design brief. Every screen has at least one element unique to IAMA's refactoring context.

**Hard design anti-patterns (never ship):**

- Chat bubble layout as **primary** interaction model. (Natural language input IS allowed in intervention/repair stages as a command panel — see Section 6.8. The prohibition is on using chat messenger aesthetics as the default UX pattern.)
- Purple gradient hero sections or AI-brand color palette.
- Floating assistant avatar or AI personality indicators.
- Emoji in functional UI (only allowed in user-generated BDD/SDD text if users choose to write them).
- Template-looking empty states with stock illustrations.
- Spinner-only progress states with no semantic content.
- AI "thinking" or "reasoning out loud" narrative text as a UI element.
- Conversation history in a WhatsApp/iMessage-style scrollable thread.

---

## 2. Icon System

### 2.1 Primary icon library: Lucide

Use **Lucide** (MIT license) as the primary icon library. Lucide is consistent, well-maintained, and ships both React components and raw SVGs.

- NPM package: `lucide-react` (for React/Webview) or `lucide` (for raw SVG)
- GitHub: `lucide-icons/lucide`
- Style: 24x24px default, 2px stroke, rounded caps and joins

### 2.2 Icon semantic assignments

The table below is normative. Do not substitute icons arbitrarily — semantic consistency is part of the design contract.

**Workflow states:**

| State / Concept | Lucide Icon | Notes |
|---|---|---|
| Pending / Queued | `Clock` | Not a spinner — static indicates "scheduled" |
| Analyzing | `ScanSearch` | Active scan metaphor |
| Waiting for user input | `CirclePause` | Paused, not failed |
| Generating tests | `TestTube2` | Lab/test context |
| Baseline validation | `ShieldCheck` | Protection/verification |
| Baseline failed | `ShieldAlert` | Orange/amber variant |
| Refactoring (active) | `Wrench` | Engineering action |
| Self-healing (retry) | `RefreshCw` | Rotation = retry |
| Self-healing (retry N of 10) | `RefreshCw` + count badge | Never omit count |
| Delivered / Success | `PackageCheck` | Artifact delivered |
| Fallback required | `TriangleAlert` | Amber — needs action |
| Failed | `XCircle` | Red — terminal |
| Heartbeat lost | `WifiOff` | Disconnection state |
| Reconnecting | `Wifi` + pulsing opacity | Animated |

**Actions:**

| Action | Lucide Icon | Notes |
|---|---|---|
| Start job | `Play` | Solid fill preferred |
| Cancel job | `Square` | Stop metaphor |
| Force terminate | `OctagonX` | Destructive — use red |
| Apply patch | `GitMerge` | Merge metaphor |
| Reject patch | `GitBranchPlus` (crossed) | Use `X` overlay or `Ban` |
| Download artifact | `Download` | |
| View diff | `Diff` | |
| Revert | `Undo2` | |
| Edit spec | `PencilLine` | Not pencil alone |
| Expand detail | `ChevronDown` | |
| Collapse detail | `ChevronUp` | |
| Copy to clipboard | `Copy` | |
| Report issue | `Bug` | |
| Settings | `Settings` | |
| Refresh / reload | `RotateCw` | |

**Risk and compliance:**

| Concept | Lucide Icon | Notes |
|---|---|---|
| High risk | `TriangleAlert` | Red |
| Medium risk | `TriangleAlert` | Amber |
| Low risk | `Info` | Muted |
| Security / isolation | `Lock` | |
| Compliance / audit | `FileCheck2` | |
| Data privacy | `EyeOff` | |
| Secret detected | `KeyRound` | |
| Network blocked | `WifiOff` | |

**File and code:**

| Concept | Lucide Icon | Notes |
|---|---|---|
| File | `File` | |
| File modified | `FilePen` | |
| File added | `FilePlus2` | |
| File deleted | `FileMinus2` | |
| Folder | `Folder` | |
| Repository | `GitFork` | |
| Branch | `GitBranch` | |
| Pull request | `GitPullRequest` | |
| Test file | `FlaskConical` | |
| Code | `Code2` | |
| Terminal | `Terminal` | |

**Navigation and UI:**

| Concept | Lucide Icon | Notes |
|---|---|---|
| Close panel | `X` | |
| Back | `ArrowLeft` | |
| Forward | `ArrowRight` | |
| External link | `ExternalLink` | Always indicate external |
| Usage / quota | `Gauge` | |
| Billing | `CreditCard` | |
| User account | `CircleUser` | |
| Organization | `Building2` | |
| Log out | `LogOut` | |
| Notification | `Bell` | |

### 2.3 Custom SVG usage

When Lucide does not have an appropriate icon (for example, IAMA-specific concepts like refactoring strategy levels), use custom SVG. Rules for custom SVGs:

- Match Lucide's visual style: 2px stroke, rounded caps, 24x24 viewBox.
- Do not use fill-only icons if surrounding icons are all stroke-based.
- Custom SVGs must be stored in `/assets/icons/` as `.svg` files and as React components.
- Gemini-generated SVGs are acceptable if they follow the above stroke/style rules. Review before shipping.

### 2.4 Icon sizing

| Context | Size |
|---|---|
| Inline text | 16px |
| Button / action | 16px or 20px |
| Panel header | 20px |
| State badge / indicator | 16px |
| Large status display | 24px |
| Empty state | 40px (max) |

---

## 3. Color System

### 3.1 Design principle

Colors carry semantic meaning only. No decorative gradient, no brand color for aesthetics. Every color must communicate something specific to the user.

### 3.2 Semantic color tokens

The implementation will use CSS custom properties. The names below are the design token names.

**Neutral base (IDE-compatible):**

```
--color-surface-base        Background of panels and containers
--color-surface-raised      Cards, dropdown menus, tooltips
--color-surface-overlay     Modal overlays
--color-border-default      Default borders
--color-border-subtle       Hairline separators
--color-text-primary        Main text
--color-text-secondary      Supporting / label text
--color-text-muted          Disabled, placeholder text
--color-text-inverse        Text on colored backgrounds
```

**Semantic state colors:**

```
--color-status-success      Job delivered, baseline passed, patch applied
--color-status-warning      Fallback required, baseline failed, quota 80%
--color-status-danger       Failed, quota 100%, secret detected, force terminate
--color-status-info         Analyzing, generating, syncing (non-error active states)
--color-status-neutral      Pending, waiting for user input
--color-status-paused       Heartbeat lost / grace window (amber-blue hybrid)
```

**Risk level colors:**

```
--color-risk-high           Applied to Conservative strategy badge
--color-risk-medium         Applied to Standard strategy badge
--color-risk-low            Applied to Comprehensive strategy badge (deeper refactor = higher risk)
```

Note: Risk color follows actual change risk. Conservative = lowest change = lowest risk color. Comprehensive = deepest change = highest risk color.

**Code and diff:**

```
--color-diff-added          Line added in diff view
--color-diff-removed        Line removed in diff view
--color-diff-context        Unchanged context lines
--color-diff-hunk-header    Hunk header @@ markers
--color-diff-added-bg       Background for added lines
--color-diff-removed-bg     Background for removed lines
```

### 3.3 Dark and light mode

Both VS Code extension and web portal support dark and light modes. All color tokens have both dark and light values. Default to system preference; allow manual override.

VS Code extension webview inherits VS Code's theme variables where possible (`--vscode-editor-background`, etc.) and maps to IAMA tokens. Do not hardcode hex colors in component code.

---

## 4. Typography System

### 4.1 Font selection

| Surface | Font | Fallback |
|---|---|---|
| VS Code Extension (Webview) | VS Code's UI font (`--vscode-font-family`) | `system-ui`, `-apple-system`, `sans-serif` |
| Web Portal | `Inter` (self-hosted, WOFF2) | `system-ui`, `-apple-system`, `sans-serif` |
| Code / Diff / Terminal | `JetBrains Mono` (self-hosted) or VS Code's editor font | `Menlo`, `Monaco`, `Consolas`, `monospace` |

Do not use decorative typefaces. Do not use font weights below 400.

### 4.2 Type scale

| Token | Size | Weight | Line height | Usage |
|---|---|---|---|---|
| `--text-xs` | 11px | 400 | 16px | Labels, status badges, timestamps |
| `--text-sm` | 13px | 400 | 20px | Body text, descriptions |
| `--text-base` | 14px | 400 | 22px | Default UI text |
| `--text-md` | 15px | 500 | 24px | Section headings, panel titles |
| `--text-lg` | 18px | 600 | 28px | Page headings |
| `--text-xl` | 22px | 600 | 32px | Screen headings (web only) |
| `--text-code` | 13px | 400 | 20px | Code, diff, terminal (monospace) |
| `--text-code-sm` | 11px | 400 | 16px | Inline code within text |

### 4.3 Typography constraints

- Never mix more than 2 font sizes in a single UI component.
- Panel headers: always `--text-md`, `500` weight.
- Section labels above input groups: `--text-xs`, `500` weight, uppercase, `0.08em` letter-spacing.
- Error messages: `--text-sm`, `400` weight, `--color-status-danger`.
- Never use italic for anything other than code inline within prose.

---

## 5. Spacing System

8px base unit. All spacing values must be multiples of 4px.

```
--space-1   4px
--space-2   8px
--space-3   12px
--space-4   16px
--space-5   20px
--space-6   24px
--space-8   32px
--space-10  40px
--space-12  48px
--space-16  64px
```

VS Code extension sidebar width is fixed by VS Code. Panel internal padding: `--space-4` (16px) on sides, `--space-3` (12px) on top.

---

## 6. Component Patterns

### 6.1 State badges

State badges are small pill-shaped indicators. They combine icon + label. Never use icon-only badges — screen readers require text.

```
[ icon ] STATUS TEXT
```

Width: `fit-content` with `min-width: 80px`. Height: 22px. Border radius: 4px (not full pill — pills look consumer-grade).

State colors map to semantic tokens. Never use arbitrary colors.

### 6.2 Risk score indicators

Risk scores appear on strategy proposals. Do not use progress bars or circular gauges (too dashboard-y). Use a horizontal bar graph with discrete segments.

```
Risk level: HIGH
[ ■ ■ ■ ■ ■ ] (5 filled, 0 empty — full risk)
```

Or for LOW risk:
```
Risk level: LOW
[ ■ □ □ □ □ ] (1 filled)
```

5 discrete segments. Color follows `--color-risk-*` tokens. Segment count is not an exact numeric — it represents a category (LOW / MEDIUM / HIGH).

### 6.3 Progress / stage timeline

Used in execution console. A vertical list of stages, each with: icon, stage name, state badge, and elapsed time if completed.

```
  [check]  ANALYZING           COMPLETED   3.2s
  [check]  WAITING STRATEGY    COMPLETED   —
  [check]  SPEC APPROVAL       COMPLETED   —
  [spin ]  GENERATING TESTS    IN PROGRESS 12s...
  [clock]  BASELINE VALIDATION PENDING     —
  [clock]  REFACTORING         PENDING     —
```

Never show a blank spinner without a stage label. Every active state shows elapsed time.

### 6.4 Diff view

Diff view must use a code-specific component, not generic text. Requirements:

- Monospace font (`--text-code`).
- Line numbers in muted color on left gutter.
- `+` lines: `--color-diff-added-bg` background.
- `-` lines: `--color-diff-removed-bg` background.
- Hunk headers (`@@`): `--color-diff-hunk-header` color, slightly indented.
- Partial acceptance: checkbox per hunk (Segment B/C) or per file (all users). Checkbox uses Lucide `Square` (unchecked) / `CheckSquare` (checked).
- Unaccepted hunks: visually dimmed but not hidden.

### 6.5 Action buttons

Primary action: filled background, `--color-status-info` or context-appropriate status color.
Secondary action: border only, no fill.
Destructive action: `--color-status-danger` border and text, no fill by default. Filled only for final confirmation dialogs.

Button height: 32px (standard), 28px (compact), 40px (primary CTA only).
Always include icon + text label. Never icon-only for important actions.

### 6.6 Alert panels

Used for warnings, blocking conditions, and error states. Not toast notifications — these are persistent in-context alerts.

Structure:
```
+------------------------------------------+
| [icon] Title text                         |
|        Supporting description text        |
|        [Action button] [Dismiss]          |
+------------------------------------------+
```

Left border color: semantic state color.
Background: 10% opacity of semantic state color.
Icon: semantic icon from table above.

### 6.7 Structured decision panels (Fallback)

The fallback view is NOT a chat interface. It is a structured panel with:

1. Evidence section: list of failed tests with names and error excerpts. Collapsible.
2. Last patch summary: what was attempted, where it failed. Collapsible.
3. Action section: labeled buttons with explicit consequences.

```
FALLBACK REQUIRED
After 10 attempts, the refactor could not be completed.

FAILURE EVIDENCE                         [expand v]
  > test_parse_legacy_config — AssertionError line 42
  > test_migrate_db_schema   — AttributeError: 'NoneType'

LAST PATCH SUMMARY                       [expand v]
  Attempted: Rewrite parse_config() to use dataclasses
  Applied:   src/config/parser.py (3 changes)
  Result:    2 tests failed after apply

WHAT WOULD YOU LIKE TO DO?

  [Retry with stronger model]
  [Edit spec and retry]
  [Download partial artifact]
  [Report this failure]
  [Close and restore workspace]
```

Primary action buttons are labeled controls with clear consequences. Retry actions explain what model tier will be used.

The structured panel also includes a natural-language command panel (Section 6.8) below the action buttons.

### 6.8 Natural Language Command Panel (Intervention / Repair Stages)

The command panel is the agentic instruction interface available in `USER_INTERVENING` state and as a secondary option in `FALLBACK_REQUIRED` state. It is NOT a chat messenger. Visual treatment:

```
INSTRUCT THE AI
─────────────────────────────────────────────
> [___________________________________] [Run]
─────────────────────────────────────────────
LAST COMMAND RESULT
  Command: "Fix the encoding error in parse_config"
  ─────────────────────────────────────────
  Applied: src/config/parser.py (2 changes)
  ─────────────────────────────────────────
  TESTS AFTER CHANGE
  [check] test_parse_legacy_config   PASSED
  [check] test_migrate_db_schema     PASSED
  [fail ] test_encoding_edge_case    FAILED
           AssertionError: expected utf-8
  ─────────────────────────────────────────
  [View diff]  [Run tests again]
```

Design rules:
- The `>` prompt character (monospace) is the only visual cue that this is an input — it reads as a terminal/command metaphor, not a chat messenger.
- Input field: single line by default, expands to multi-line on Shift+Enter. Max 3 lines before scroll.
- No conversation history thread. Only the most recent command result is displayed. Previous results are accessible via `[Show command history]` expand control (collapsed by default).
- AI response is rendered as a structured result block: command echoed, diff applied, test results list. Never as a text paragraph or chat bubble.
- Model indicator: small label in the command panel header shows current model class (e.g., `using: claude-sonnet-class`). During Deep Fix auto-upgrade: `using: claude-opus-class (Deep Fix)`.
- If user's command is ambiguous or cannot be executed: structured error block, not a conversational refusal message.
- The panel section header "INSTRUCT THE AI" can be relabeled "REPAIR COMMAND" if team prefers less product-centric language. Decision at design review.

---

## 7. Motion and Animation

Minimal animation. Only use motion when it communicates state change.

- State badge transitions: `opacity` only, `150ms ease-out`. No scale, no slide.
- Expanding/collapsing sections: `max-height` transition, `200ms ease`. Nothing faster (jarring) or slower (sluggish).
- Heartbeat loss countdown: text update only, no pulsing backgrounds.
- Spinner for active states: single-rotation, `1.2s linear infinite`. No bounce, no multi-element spinners.
- Diff view syntax highlighting: no animation.

Honor `prefers-reduced-motion`. When reduced-motion is active: remove all transitions, replace spinner with static `[...loading]` text indicator.

---

## 8. Accessibility Requirements

1. All interactive elements reachable by keyboard (`Tab` order follows visual flow).
2. All icons accompanied by `aria-label` or visible text label.
3. Color contrast: text on background >= 4.5:1 (normal text), >= 3:1 (large text / UI components).
4. Diff view: do not rely on color alone to distinguish added vs removed; `+` / `-` prefix characters are always visible.
5. State badges: color + icon + text, never color alone.
6. `prefers-reduced-motion` respected.
7. Error messages are associated with their field via `aria-describedby`.
8. Screen reader landmark regions: `<main>`, `<nav>`, `<aside>`, `<header>` used where applicable.

---

## 9. Icon Implementation Note

Icons sourced from Lucide are available as:

- **React component** (Webview/Web): `import { Clock, ShieldCheck } from 'lucide-react'`
- **Raw SVG** (for non-React contexts): download from lucide.dev or bundle from NPM `lucide` package

When using Lucide icons in VS Code webview React components:
```tsx
import { ShieldCheck } from 'lucide-react';

// Usage
<ShieldCheck size={16} strokeWidth={2} className="icon-success" />
```

When generating custom SVGs with Gemini:
- Request stroke-based SVG, not fill-based.
- Specify `viewBox="0 0 24 24"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Remove any hardcoded color attributes; color is applied via CSS `currentColor`.
- Review output for unnecessary complexity before committing.
