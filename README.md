# IAMA-0220

IAMA (Intelligent Autonomous Multi-surface Agent) 是一個以「低風險程式重構」為核心的產品規格專案。  
本 repository 目前是 **規格優先 (spec-first)** 型態，重點在 PRD/ADR/API/DB/UX 的完整定義，而非程式碼實作。

## 專案定位
IAMA 的核心價值:

1. 行為不回歸 (Preserve behavior)。
2. 每次變更可審計 (Auditable)。
3. 失敗可恢復、可回退、可介入 (Fallback / Intervention)。

核心方法:

1. 策略提案選擇 (Proposal Selection)。
2. 自然語言 BDD/SDD 編修。
3. TDD 生成與 Baseline 驗證。
4. Self-healing 迴圈與 Deep Fix。
5. Diff-first 交付。

## 專案現況分析 (重要)
這個 repo 目前是「完整需求與架構規格庫」，可以直接作為開發藍圖:

1. `V1` 定義 IDE-first、Local execution、完整配額與風險控制流程。
2. `V2` 擴充 Web/GitHub、Remote sandbox、Team/Enterprise 治理。
3. ADR 已鎖定三個不可替換的核心決策:
   1. Workflow Engine: `Temporal.io` (ADR-001)
   2. LLM Proxy: `LiteLLM + IAMA Router` (ADR-002)
   3. Remote Sandbox (V2): `E2B self-hosted (gVisor -> Firecracker)` (ADR-003)

結論: 這不是「從零設計」專案，而是「照規格精準落地」專案。

## Repository 結構
```text
.
├─ AGENT.MD                            # 本 repo Agent 執行約束
├─ README.md                           # 專案總覽
└─ Docs
   ├─ README.md                        # 文件索引
   ├─ IAMA_PRODUCT_REQUIREMENTS_V1_EN.md
   ├─ IAMA_PRODUCT_REQUIREMENTS_V1_ZH.md
   ├─ IAMA_PRODUCT_REQUIREMENTS_V2_EN.md
   ├─ IAMA_PRODUCT_REQUIREMENTS_V2_ZH.md
   ├─ ADR
   │  ├─ ADR-001-Workflow-Engine.md
   │  ├─ ADR-002-LLM-Proxy.md
   │  └─ ADR-003-V2-Sandbox-Execution.md
   ├─ DEV
   │  ├─ SERVICE_ARCHITECTURE.md
   │  ├─ API_CONTRACT.md
   │  ├─ DB_SCHEMA.md
   │  ├─ AGENT_DEVELOPMENT_GUIDE.md
   │  └─ DEVELOPMENT_WORKFLOW.md
   └─ UX
      ├─ UX-DESIGN-SYSTEM.md
      ├─ UX-WIREFRAME-IDE.md
      └─ UX-WIREFRAME-WEB.md
```

## V1 / V2 範圍摘要
| 面向 | V1 | V2 |
|---|---|---|
| 主要介面 | IDE (VS Code) | IDE + Web |
| 執行環境 | Local Docker / Local Native | Local + Remote Sandbox |
| GitHub 整合 | 無 | 有 (OAuth + PR Delivery) |
| 協作能力 | 單使用者為主 | Team / Org / Role / Audit |
| 合規能力 | 基礎 | 含 Data Erasure / Audit Export / Zero Telemetry Mode |

## 關鍵工程約束 (一定要遵守)
1. 不可自創 API route，全部以 `Docs/DEV/API_CONTRACT.md` 為準。
2. 不可自創 DB 欄位/資料表，全部以 `Docs/DEV/DB_SCHEMA.md` 為準。
3. 不可繞過 entitlement/quota/ownership。
4. 不可直接呼叫 model provider SDK，必須經 LLM Router。
5. 不可用 line-number diff 作為 patch apply authority，必須走 `patch_edit_schema`。
6. UI 不可做成 generic AI chatbot 風格。

## 已識別的一致性風險 (開發時必看)
目前文件有少數不一致，需要按優先序落地:

1. Max context cap: 少數註解仍出現 `500K`，但權威規格為 `200K` (Max) / `1M` (Enterprise)。
2. Error response format: `API_CONTRACT` 與 `AGENT_DEVELOPMENT_GUIDE` 示例有差異，對外 API 以 `API_CONTRACT` 為準。
3. State naming: `AGENT_DEVELOPMENT_GUIDE` 與 PRD 命名不完全一致，Workflow 以 PRD state machine 為準。
4. 路由前綴表示不一致: 以 `API_CONTRACT` endpoint 列表為準。

## 建議開發順序 (落地藍圖)
1. Sprint 0 PoC:
   1. Node API <-> Python Temporal type sync
   2. `patch_edit_schema` apply 機制
2. V1 Core:
   1. Auth / Subscription / Usage / Billing
   2. Job lifecycle + Temporal workflow
   3. Proposal + BDD/SDD + revision locking
   4. Baseline + Self-healing + Intervention/Deep Fix
   5. Delivery/Fallback + Audit/Telemetry
3. V2 Expansion:
   1. GitHub integration + preflight + head drift/rebase
   2. Remote sandbox + wipe evidence + egress policy
   3. Cross-surface sync + remote artifact apply conflict flow
   4. Enterprise governance + compliance APIs

## 開發前讀取順序
1. `Docs/IAMA_PRODUCT_REQUIREMENTS_V1_EN.md`
2. `Docs/IAMA_PRODUCT_REQUIREMENTS_V2_EN.md`
3. `Docs/DEV/API_CONTRACT.md`
4. `Docs/DEV/DB_SCHEMA.md`
5. `Docs/ADR/*.md`
6. `Docs/DEV/SERVICE_ARCHITECTURE.md`
7. `Docs/UX/*.md`
8. `AGENT.MD`

## 交付標準
每項功能交付時至少要有:

1. Requirement ID 對應。
2. API/DB/Workflow 一致性證據。
3. 測試證據 (unit + integration + contract)。
4. 安全/隱私檢查 (ownership, secret redaction, telemetry minimization)。

## 相關文件
1. 文件索引: `Docs/README.md`
2. Agent 執行規範: `AGENT.MD`
3. 完整開發流程: `Docs/DEV/DEVELOPMENT_WORKFLOW.md`

