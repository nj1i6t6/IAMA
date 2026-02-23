# IAMA Documentation Index

## Product Requirements

| File | Language | Version | Description |
|------|----------|---------|-------------|
| `IAMA_PRODUCT_REQUIREMENTS_V1_EN.md` | English | 2.0 | V1 canonical spec (machine-facing) |
| `IAMA_PRODUCT_REQUIREMENTS_V1_ZH.md` | Chinese | 2.0 | V1 spec (founder/product review) |
| `IAMA_PRODUCT_REQUIREMENTS_V2_EN.md` | English | 2.0 | V2 canonical spec (machine-facing) |
| `IAMA_PRODUCT_REQUIREMENTS_V2_ZH.md` | Chinese | 2.0 | V2 spec (founder/product review) |

## Architecture Decision Records (`ADR/`)

| File | Title | Decision |
|------|-------|---------|
| `ADR/ADR-001-Workflow-Engine.md` | Workflow Engine | Use Temporal.io, not Celery, Airflow, or custom polling |
| `ADR/ADR-002-LLM-Proxy.md` | LLM Proxy Layer | Use LiteLLM + IAMA Router, never call providers directly |
| `ADR/ADR-003-V2-Sandbox-Execution.md` | V2 Sandbox Execution | Use E2B self-hosted gVisor/Firecracker, not Modal or shared containers |

## UX Specifications (`UX/`)

| File | Description |
|------|-------------|
| `UX/UX-DESIGN-SYSTEM.md` | Design tokens, component library, visual language |
| `UX/UX-WIREFRAME-IDE.md` | IDE plugin wireframes (VS Code, JetBrains) |
| `UX/UX-WIREFRAME-WEB.md` | Web interface wireframes (V2 GitHub surface) |

## Developer Reference (`DEV/`)

| File | Description |
|------|-------------|
| `DEV/AGENT_DEVELOPMENT_GUIDE.md` | Read first. Anti-hallucination rules, state machine, tier enforcement, common drift patterns |
| `DEV/DEVELOPMENT_WORKFLOW.md` | End-to-end delivery workflow from requirement intake to release/operations gates |
| `DEV/SERVICE_ARCHITECTURE.md` | System topology, service inventory, data flows, deployment |
| `DEV/API_CONTRACT.md` | Authoritative endpoint definitions, do not invent routes |
| `DEV/DB_SCHEMA.md` | Authoritative table/column definitions, do not invent tables |

## Repository-Level Docs

| File | Description |
|------|-------------|
| `../README.md` | Project overview, scope summary, implementation constraints |
| `../AGENT.MD` | Local agent execution contract for drift prevention |

---

## How to Use

### AI agents building this product
1. Read `DEV/AGENT_DEVELOPMENT_GUIDE.md` first as primary anti-drift reference.
2. Use `*_EN.md` PRDs as canonical requirements and acceptance criteria.
3. Use `DEV/API_CONTRACT.md` for endpoint definitions.
4. Use `DEV/DB_SCHEMA.md` for schema definitions.
5. Check `ADR/` before selecting any workflow, LLM, or sandbox technology.
6. Follow `DEV/DEVELOPMENT_WORKFLOW.md` for end-to-end execution process.
7. Follow `../AGENT.MD` for local source-of-truth priority and conflict handling.

### Founder / product review
1. Use `*_ZH.md` files for requirement review.
2. EN and ZH files should stay aligned on section numbering and requirement IDs.

---

## Consistency Rules

1. V1 EN and V1 ZH must share section numbering and requirement IDs.
2. V2 EN and V2 ZH must share section numbering and requirement IDs.
3. If one language file is updated, update the paired language file in the same commit.
4. Update `DEV/API_CONTRACT.md` and `DEV/DB_SCHEMA.md` whenever PRD changes API/schema requirements.
5. Any technology choice that contradicts an ADR requires a new superseding ADR.

## Scope Boundary

- PRD files define what the product does.
- ADR files define selected technologies and rationale.
- UX files define interaction and visual constraints.
- DEV files define build contracts and development workflow.

