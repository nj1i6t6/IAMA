# IAMA (Intelligent Architecture Migration Assistant) - Ultimate Blueprint v4.2

> **Status:** Execution Ready (工程落地版)
> **Positioning:** Enterprise Software Evolution OS (企業級軟體演進作業系統)
> **Philosophy:** "Code is Data, Migration is Computation, Safety is Mathematical."
> **Strategy:** LSP-First Headless Core + Hybrid Data Plane + Graph-Native Intelligence

---

## 1. North Star Metrics (北極星指標)
我們關注確定性、成本與效率的平衡。

1.  **Zero-Touch Migration Rate (ZTM):** 無需人工修改代碼即可通過測試並上線的變更比例 (Target: 80%)。
2.  **Behavioral Consistency Score (BCS):** 透過 Shadow Mode 驗證新舊系統在相同輸入下，輸出完全一致的比例 (Target: 99.999%)。
3.  **Cost Per Migration Unit (CPMU):** 平均每遷移 1000 行代碼所需的 Token 與運算成本。
4.  **Human Correction Rejection Rate (HCR):** AI 學習人工修正後，不再犯同樣錯誤的比例。

---

## 2. System Architecture: The Distributed Neural Core

### Layer 1: The Adaptive Interface (Protocol Layer)
- **Core Protocol:** Strictly follows **LSP (Language Server Protocol)** standard.
- **Visual Protocol Extension (Rich UI Overlay):**
    - **Mechanism:** Uses **VS Code Webview API** as a canvas, running **React Flow** or **Cytoscape.js** internally.
    - **Communication:** Async communication via `postMessage`.
    - **Optimization:** Sends **Delta Updates** only to avoid JSON serialization overhead.
- **Data Pipe (GraphQL):** Aggregated queries for the SaaS Dashboard.

### Layer 2: The Intelligence Swarm (Multi-Agent Brain)
- **Architect Agent (Planner):**
    - **Incremental Graph Parsing:** Parses only `git diff` changes to update the subgraph, avoiding timeouts on large repos.
    - **Graph-Native Retrieval:** Uses **K-Hop Neighbor** algorithms to extract Minimal Context via GraphRAG.
- **Coder Agent (Executor):** Generates code modifications with Feedback Memory.
- **Reviewer Agent (Critic):** Enforces linters and architectural rules.
- **Guardian Agent (Security):** Scans for dependency vulnerabilities (SCA).

### Layer 3: The Execution Sandbox (Edge-Smart Hybrid Plane)
- **Edge Intelligence:** AST Parsing, Static Analysis, and Vector Embedding happen inside the **Customer's Local MicroVM**.
- **Privacy-First Transmission:** Only **Vectors** and **Anonymized Metadata** are sent to the SaaS Control Plane. Raw code never leaves the VPC.
- **Secure Tunnel:** Worker initiates **mTLS Outbound** connection (No Inbound ports required).

### Layer 4: The Commercial & Memory Core
- **Code Graph (Neo4j):** Stores AST dependencies and impact scope.
- **Vector Index (Qdrant):** Stores code intent and **Anonymous Structural Patterns**.
- **Usage Metering:** Records "Migration Operations" for usage-based billing.
- **Seat Management:** Controls concurrent IDE plugin sessions.

---

## 3. The Four Core Engines

### 3.1 Module A: Analysis & Incremental Parsing
- **Hybrid Parsing:** Tree-sitter (Skeleton) + LLM Embedding (Flesh).
- **Incremental Strategy:**
    - **Initial Import:** Full parsing (Background Async).
    - **Dev Loop:** **On-Save / On-Commit** triggers incremental parsing, updating only affected AST nodes.

### 3.2 Module B: Hybrid Orchestration
- **Pre-Flight Cost Estimator:** Calculates estimated Token cost (e.g., "$15.5") before execution; requires user approval if over budget.
- **Tiered Inference Strategy:**
    - **Tier 1 (Rule-based):** OpenRewrite/Codemod (80% traffic, zero cost).
    - **Tier 2 (Small Model):** Llama-3-70B / GPT-4o-mini.
    - **Tier 3 (Reasoning Model):** Claude 3.5 Sonnet / GPT-4o.
- **HITL with Memory:** Few-Shot Learning from user corrections.

### 3.3 Module C: Safe Verification & Adaptation
- **Side-Effect Free Shadow Mode:**
    - **Read Traffic:** Direct Replay.
    - **Write Traffic:** Redirects to **Copy-on-Write DB Snapshot** or Mocked Services.
- **Sandboxed ETL Generator (Schema Adaptation):**
    - Generates Python/JS scripts to map data between old and new schemas.
    - **Dry-Run Data Validator (The Safety Net):**
        1.  **Sampling:** Select 100 real records.
        2.  **Trial Run:** Execute mapping in sandbox.
        3.  **Invariant Check:** Verify total amounts, foreign keys, etc.
        4.  **Result:** Full execution allowed ONLY after Dry-Run passes.

### 3.4 Module D: Governance & Ecosystem
- **Policy-as-Code:** Agent enforces enterprise architectural rules.
- **Anonymous Structural Patterns:** Sharing AST transformation logic with Differential Privacy.

---

## 4. Engineering Guardrails (Implementation Risks)

> **WARNING:** These are critical traps to avoid during Phase 1.

1.  **GraphRAG Performance Trap:**
    - **Risk:** Full graph construction for million-line repos is too slow.
    - **Solution:** Strict **Lazy Loading** and **Incremental Parsing**. Do not build the full graph on startup.

2.  **Schema Adaptation Complexity:**
    - **Risk:** Auto-generated ETL scripts may corrupt data.
    - **Solution:** Enforce **Human-in-the-Loop** review for all mapping logic in Phase 1 & 2. Do not automate execution without approval.

3.  **Webview Communication Overhead:**
    - **Risk:** Passing large AST JSONs between Extension Host and Webview causes UI lag.
    - **Solution:** Send only **Render Props** (coordinates, labels, colors). Keep logic in Rust/Extension Host.

---

## 5. Technology Stack

| Component | Technology | Reasoning (First Principles) |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 15 (App Router)** | Standard for complex state & SSR. |
| **Backend API** | **Python (FastAPI)** | Native AI/LangChain integration; high async performance. |
| **LSP Server** | **Rust** | Extreme performance for AST parsing & memory safety. |
| **IDE UI** | **React Flow** | Efficient node-based rendering in Webview. |
| **Orchestration** | **Temporal.io** | Durable execution for long-running workflows. |
| **Sandbox** | **AWS Firecracker** | Millisecond-level isolation (MicroVMs). |
| **Graph DB** | **Neo4j** | Standard for dependency graph & GraphRAG. |
| **Vector DB** | **Qdrant** | High-performance vector search. |
| **Validator** | **Pandas / Great Expectations** | Data quality checks for Dry-Run. |

---

## 6. Execution Roadmap

### Phase 0: The "Wizard of Oz" Validation (Weeks 1-2)
- **Goal:** Prove the "Analysis -> Migration" logic works manually before building the engine.
- **Method:** Python Scripts + Manual Claude API calls + Human Review.
- **Deliverable:** A documented Prompt Chain that successfully refactors a module.

### Phase 1: The Headless Brain (SaaS MVP) (Weeks 3-12)
- **Goal:** End-to-end automation of Phase 0 logic.
- **Key Tech:** LSP Protocol, Temporal Workflows, **Incremental Parsing**.
- **Deliverable:** "Hello World" Migration running on the full stack.

### Phase 2: The Safe Enterprise (BYOC & Shadow) (Month 4-6)
- **Goal:** Enterprise trust & billing.
- **Key Tech:** Firecracker Sandbox, **Dry-Run Validator**, Usage Metering.

### Phase 3: The Ecosystem (IDE & Evolution) (Month 7+)
- **Goal:** Developer adoption.
- **Key Tech:** VS Code **Visual Overlay**, Marketplace, Federated Learning.