# ADR-002: LLM Proxy Architecture Selection

Document ID: `IAMA-ADR-002`
Status: `Decided`
Date: 2026-02-22
Deciders: Backend Architecture Lead, Engineering Lead
Relates to: `V1-FR-ROUTE-001` through `V1-FR-ROUTE-006`, `V1-FR-CTX-004` through `V1-FR-CTX-006`, `V1-FR-SUB-004`, Section 6.2 Component 7

---

## Context

IAMA requires a cloud-side LLM proxy that sits between the backend workflow engine and model providers. This proxy must:

1. **Multi-provider routing** (V1-FR-ROUTE-001): Translate OpenAI-compatible request shapes to provider-specific formats (Anthropic, OpenAI, Google, MiniMax, etc.) without surfacing provider-specific clients to the workflow engine.
2. **Stage-aware model routing** (V1-FR-ROUTE-002): Route by stage (`planning`, `test_generation`, `refactor`, `repair`) and by user tier.
3. **Three-phase waterfall routing** (V1-FR-ROUTE-003): Phase 1 (base model), Phase 2 (advanced model), Phase 3 (premium model) with retry budgets per phase.
4. **Entitlement-gated escalation** (V1-FR-ROUTE-005): Block unauthorized model class access with machine-readable denial.
5. **Plan-level token cap enforcement** (V1-FR-SUB-004): Block oversized requests before provider dispatch.
6. **AST-based pruning integration** (V1-FR-CTX-004): Execute pruning policy before rejecting oversized context.
7. **Prompt caching** (V1-FR-CTX-006): Cache stable context segments; record cache hit/miss telemetry.
8. **Tolerant JSON parsing and repair** (LLM Output Contract, item 7): Parse and attempt repair on malformed JSON before hard schema failure.
9. **Structured output enforcement** (LLM Output Contract, item 6): Use provider-native structured output controls when available.
10. **Cost tracking and rate limiting** per plan tier.

The proxy is the single point through which all model calls pass. It must be secure, policy-enforced, and operationally observable.

---

## Options Evaluated

### Option A: LiteLLM as Base Layer + Custom IAMA Routing Layer (Selected)

LiteLLM is an open-source Python library (and optional proxy server) that provides a unified OpenAI-compatible interface across 100+ model providers. It handles provider-specific translation, retry, fallback, cost tracking, and rate limiting.

**Capabilities matched to IAMA requirements:**

| IAMA Requirement | LiteLLM Capability |
|---|---|
| Multi-provider translation (Anthropic, OpenAI, Google, MiniMax) | Built-in provider adapters |
| OpenAI-compatible request interface | Native — this is LiteLLM's primary design goal |
| Cost tracking per call | Built-in cost logging and budget management |
| Rate limiting per user/key | Built-in via `litellm.Router` with `rpm_limit`, `tpm_limit` |
| Fallback between providers | `Router.acompletion()` with fallback list |
| Retry with exponential backoff | Built-in `num_retries` and backoff |
| Structured output / JSON mode | Provider-native JSON mode proxied |
| Prompt caching (Anthropic, OpenAI) | Provider cache-control headers proxied |
| Streaming support | Full streaming pass-through |

**Custom IAMA layer on top of LiteLLM handles:**

- Stage-to-model-class mapping (`planning` -> base model class, `refactor` -> advanced model class, etc.)
- Entitlement-gated model class enforcement (V1-FR-ROUTE-005)
- Phase waterfall logic: Phase 1 / Phase 2 / Phase 3 retry budget accounting
- Pre-call token cap check and AST pruning gate (V1-FR-SUB-004, V1-FR-CTX-004)
- Tolerant JSON parsing and controlled repair pass (LLM Output Contract item 7)
- Audit event emission per call (model route, stage, tier, success/failure, cache status)
- IAMA-specific prompt template injection (safety rules, output schema constraints, role-mode controls)

**Architecture:**

```
Workflow Engine (Temporal Activity)
        |
        v
[IAMA LLM Router Service]
  - Stage-to-model-class resolution
  - Entitlement check (tier + quota)
  - Token cap enforcement
  - AST pruning gate
  - Prompt template injection
  - Audit event pre-emit
        |
        v
[LiteLLM Router]
  - Provider selection / fallback
  - OpenAI-to-provider translation
  - Cost tracking
  - Rate limiting
  - Retry / backoff
  - Streaming
        |
        v
[Model Providers]
  Anthropic / OpenAI / Google / MiniMax / ...
```

The IAMA Router is a thin Python service layer. The LiteLLM Router is a library dependency, not a separate network service (no extra hop). For V1, both layers are in-process within the same backend service.

### Option B: Fully Custom Proxy

Build all provider translation, cost tracking, rate limiting, fallback, and retry logic from scratch.

**Assessment:**

- Estimated engineering cost: 8-14 weeks to match LiteLLM's existing provider coverage and reliability.
- Each new provider requires custom adapter implementation.
- Rate limiting, cost tracking, and retry logic are commodity code with known edge cases already solved in LiteLLM.
- Operational risk: provider API changes require internal patches.
- No prompt caching support without provider-specific implementation per provider.

**This option is explicitly rejected.** The ROI is negative — building commodity proxy infrastructure delays delivery of IAMA's actual value.

### Option C: LiteLLM Proxy Server (Separate Process)

Deploy LiteLLM as a standalone proxy process (Docker container) and call it over HTTP from the backend.

**Assessment:**

- Adds a network hop and operational dependency.
- IAMA-specific routing logic would need to live in a separate service or in LiteLLM config YAML (limited expressiveness).
- No meaningful benefit over in-process library use for V1 scale.
- Adds deployment complexity without commensurate benefit.

**Deferred:** This mode may be reconsidered if multi-backend routing or independent proxy scaling becomes necessary in V2/V3. Not needed for V1.

---

## Decision

**DECIDED: LiteLLM Python library as base layer + custom IAMA LLM Router Service layer on top.**

**Deployment:**
- LiteLLM used as Python library dependency (`litellm` package), not as a standalone proxy server.
- IAMA LLM Router is a Python module within the backend service (`core/llm/`).
- For V1, both layers are in-process. Router is called directly from Temporal activity functions.

**Provider routing table (V1 defaults):**

| Stage | Phase 1 (base) | Phase 2 (advanced) | Phase 3 (premium) |
|---|---|---|---|
| planning | claude-haiku-class | claude-sonnet-class | claude-opus-class |
| test_generation | claude-haiku-class | claude-sonnet-class | claude-opus-class |
| refactor | claude-sonnet-class | claude-opus-class | claude-opus-class |
| repair | claude-haiku-class | claude-sonnet-class | claude-opus-class |

- Route table is stored in DynamicConfig (V1-FR-OPS-001) and reloadable without redeploy.
- Specific model version aliases (e.g. `claude-haiku-class` -> `claude-haiku-4-5-20251001`) are server-side configuration, not client-visible (V1-FR-ROUTE-004).

**Prompt caching:**
- Enable Anthropic prompt caching (`cache_control`) for stable context segments (system prompt, dependency interface slices).
- LiteLLM passes cache-control headers natively to Anthropic.
- Cache hit/miss recorded in usage telemetry per call.

**JSON output enforcement:**
- Use LiteLLM's `response_format={"type": "json_object"}` where provider supports it.
- Post-call: tolerant JSON parser (jsonrepair library or custom) → schema validation → controlled retry if invalid.
- Hard schema failure after repair attempt emits audit event and returns machine-readable error.

---

## Consequences

**Positive:**
- LiteLLM handles all provider translation — no custom adapter code per provider.
- Cost tracking and rate limiting from day one.
- Adding a new model provider: add credentials and alias to DynamicConfig — no code change required.
- Prompt caching works immediately for Anthropic (and OpenAI when available).

**Negative / Risks:**
- LiteLLM is an open-source library with active development; breaking changes require pinned version and periodic upgrade.
- IAMA-specific audit, entitlement, and prompt injection logic lives in IAMA Router layer and must be tested independently.
- LiteLLM's `Router` cost tracking is approximate; production cost reconciliation should still use provider invoices.

**Migration cost if wrong:** Replacing LiteLLM with a different library is confined to `core/llm/` module. IAMA Router interface is stable regardless of underlying library. Migration risk is low.

---

## Action Items

1. Add `litellm` and `jsonrepair` (or equivalent) to `requirements.txt`.
2. Refactor `core/llm/base.py` and `core/llm/real_adapter.py` into `IamaLLMRouter` class.
3. Implement `IamaLLMRouter.route()`:
   - Entitlement check before LiteLLM call.
   - Token cap enforcement + AST pruning gate.
   - Prompt template injection.
   - LiteLLM `acompletion()` call with stage-resolved model.
   - Post-call JSON repair and schema validation.
   - Audit event emission.
4. Define DynamicConfig schema for routing table (stage -> model-class -> provider-alias mapping).
5. Implement prompt caching headers for stable context segments.
6. Write unit tests for entitlement gating, phase waterfall, and JSON repair paths.
7. Define `IAMA_LLM_ROUTE_TABLE` as first DynamicConfig entry seeded at bootstrap.

---

## Amendment: L1 Model Class Definition (2026-02-22)

**Decision**: L1 (low-cost generation model class) is officially designated as a **multi-vendor class**, overriding the initial haiku-class (Anthropic-only) assumption.

**Current primary L1 candidate**: MiniMax M2.5 Standard or equivalent low-cost multi-vendor model.

**Rationale**: Multi-vendor strategy reduces provider lock-in for high-volume L1 generation workloads (test generation + refactor generation consume the majority of tokens). L1 handles all high-output generation tasks (full file output 10K–25K tokens) at minimal cost. Anthropic models are reserved for L2 (Sonnet-class) and L3 (Opus-class) roles.

**Updated route table (by model class):**

| Class | Stage assignment | Tier availability | Output cap | Constraint |
|-------|-----------------|-------------------|------------|-----------|
| L1 (multi-vendor low-cost) | `test_generation`, `refactor_generation`, `repair` iter 1–3 | All tiers | 30,000 tokens | Full file output permitted |
| L2 (Sonnet-class) | `repair` iter 4–6, `fallback_conversation`, BDD/SDD NL interpretation | Plus, Pro, Max, Enterprise | 5,000 tokens | `patch_edit_schema` ONLY |
| L3 (Opus-class) | Deep Fix mode only | Max, Enterprise | 5,000 tokens | `patch_edit_schema` ONLY + explicit user confirmation required |

**Implementation note**: Route table is resolved by IAMA Router via `IAMA_LLM_ROUTE_TABLE` DynamicConfig. Application code never hardcodes model names — always specifies `{ tier, stage, model_class }` and lets IAMA Router resolve the provider alias.

**Concurrent call limits**: Max 3 concurrent L1 calls per user session.

**Action items added:**
8. Update `IAMA_LLM_ROUTE_TABLE` seed data: L1 class → MiniMax M2.5 Standard (primary), with fallback list for resilience.
9. Add `model_class` field to all routing audit events.
10. Add output token cap enforcement (30K for L1, 5K for L2/L3) as post-generation validation step in `IamaLLMRouter`.
