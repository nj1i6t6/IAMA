IAMA - Ultimate Blueprint v6.0 (Production SaaS Edition)

Positioning: AI-Powered Legacy Code Modernization Platform (SaaS + IDE Client)
Core Philosophy: "Behavior-Driven Translation (BDD) 
→
→
 Test-Driven Execution (TDD) 
→
→
 Self-Healing Generation."
Architecture Style: Event-Driven Orchestration with Centralized Cloud Processing.

1. System Topology (End-to-End)

The platform is divided into two primary environments: the Client IDE (VS Code) and the IAMA Cloud Backend (SaaS).

1.1 The Client: VS Code Extension (Presentation & Context Layer)

Role: The user's entry point. Handles local file system access and rich UI presentation.

Tech Stack: TypeScript, VS Code Extension API, React (Webview API).

Core Responsibilities:

Authentication: OAuth/JWT login flow.

Context Gathering: User right-clicks a folder/file -> "Refactor with IAMA". The extension zips the target code and uploads it to the SaaS.

Interactive UI (React Webview): Displays the multi-step wizard (Proposals 
→
→
 BDD Checklist 
→
→
 Live Terminal 
→
→
 Diff Viewer).

IPC Communication: Uses vscode.postMessage to communicate between the Extension Host (Node.js) and the Webview (React).

1.2 The Cloud: IAMA SaaS Backend (Execution & Intelligence Layer)

Role: The heavy-lifting engine. Processes code, communicates with LLMs, and runs sandboxed tests.

Tech Stack: Python 3.12+, FastAPI, PostgreSQL, Temporal.io, Docker SDK.

Microservices Breakdown:

API Gateway (FastAPI): Handles HTTP requests, JWT validation, file uploads (S3/Local Storage), and acts as the Temporal Client.

Relational DB (PostgreSQL): Stores user accounts, subscription tiers, and migration job metadata.

Orchestration Core (Temporal Server & Workers): Manages the state machine. Ensures long-running refactoring jobs survive server restarts.

Test Sandbox (Docker): Ephemeral containers spun up to execute generated pytest/jest code safely.

2. Data Model & Schema (PostgreSQL / SQLAlchemy)

To support a multi-tenant SaaS, the database must track state across the entire refactoring lifecycle.

User Table: id, email, hashed_password, subscription_tier, created_at.

Project Table: id, user_id, project_name, language, framework.

RefactorJob Table:

id, project_id, status (PENDING, ANALYZING, WAITING_USER, REFACTORING, SUCCESS, FAILED).

original_code_path, refactored_code_path.

retry_count (int, max 10).

BDD_Behavior Table: id, job_id, description (e.g., "Given X, When Y, Then Z"), is_approved (boolean).

3. Communication Protocol (API & Real-time)
REST Endpoints (FastAPI)

POST /api/v1/auth/login 
→
→
 Returns JWT.

POST /api/v1/jobs/upload 
→
→
 Accepts ZIP file, creates RefactorJob, triggers Temporal Workflow, returns job_id.

GET /api/v1/jobs/{job_id} 
→
→
 Returns current job status and metadata.

POST /api/v1/jobs/{job_id}/bdd/approve 
→
→
 Sends a Temporal Signal to resume the workflow after the user edits/approves the BDD list.

Real-time Logs (Server-Sent Events / SSE)

GET /api/v1/jobs/{job_id}/stream 
→
→
 Pushes real-time terminal logs (e.g., "Generating tests...", "Test Failed: retrying (1/10)") to the VS Code Webview.

4. The Core Workflow: "The Safety Net" (Temporal State Machine)

This is the exact sequence of Temporal Activities. The Workflow is deterministic, and the UI reacts to its current state.

Phase 1: Ingestion & Strategy Proposal

Activity: AnalyzeLegacyCode: Parses the uploaded code to detect the tech stack and complexity.

Activity: GenerateProposals: LLM generates three tailored reports:

Beginner: Simple framework recommendations (Understandability).

Professional: Deep architectural trade-offs (Performance/Memory).

Enterprise: ROI estimation and risk analysis (Cost reduction).

Pause: Workflow waits for user selection via VS Code UI.

Phase 2: BDD Behavior Extraction (Human-in-the-Loop)

Activity: ExtractBDD: LLM translates legacy code into a human-readable business behavior list.

Signal: WaitForBDDApproval: The workflow pauses (workflow.wait_condition). The VS Code UI displays the checklist.

Human Interaction: The user reviews the list. If they type "You missed the holiday rule", the Extension calls an API to update the DB, and the AI regenerates the list. Once satisfied, the user clicks "Confirm". The API sends a Signal to Temporal to resume.

Phase 3: TDD Baseline & The Self-Healing Loop

Activity: GenerateTDD: LLM converts the approved BDD list into standard unit tests (e.g., Pytest).

Activity: RunSandboxTests(OldCode): Docker executes the tests against the legacy code to prove the tests are valid (Baseline Proof).

Activity: RefactorCode: LLM rewrites the source code using the strategy chosen in Phase 1.

The 10-Retry Loop:

Docker executes the tests against the new code.

If Success: Break loop. Proceed to Phase 4.

If Failed:

Capture stderr (Stack trace).

Activity: AnalyzeFailureAndPatch: Pass the stderr and the failed code back to the LLM. LLM generates a patch.

Increment retry_count. Loop back to execution. Max 10 times.

Phase 4: Fallback & Delivery

Success: ZIP the refactored code. Send URL to VS Code extension. Extension opens a Git-style Diff view.

Fallback (Fail > 10): Return the partially working code. Highlight the specific TDD tests that failed. Open a direct Chat UI in VS Code for the user to manually guide the AI or edit the code directly.

5. Mock & Development Strategy (Zero-Cost Dev Phase)

Since the system must be fully runnable locally without real LLM API keys, we use the Adapter Pattern (Dependency Injection).

5.1 The Interface (core/llm/base.py)
code
Python
download
content_copy
expand_less
class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate_proposals(self, code: str) -> dict: pass
    
    @abstractmethod
    async def extract_bdd(self, code: str) -> list: pass
    
    @abstractmethod
    async def generate_code(self, code: str, bdd: list) -> str: pass
5.2 The Mock Implementation (core/llm/mock_adapter.py)

The Agent must implement MockLLMProvider which reads from static JSON files.

When extract_bdd() is called, it sleeps for 2 seconds (to simulate latency) and returns a hardcoded list of 4 BDD rules.

When generate_code() is called during the retry loop, it is programmed to return a failing code block on the 1st iteration, and a passing code block on the 2nd iteration, ensuring the developer can see the UI react to the "Self-Healing" process.

5.3 Sandbox Mocking (core/sandbox/mock_docker.py)

Instead of spinning up actual Docker containers locally during UI development, the MockSandbox will simply check the loop iteration:

Attempt 1: Returns {"status": "failed", "stderr": "AssertionError: Expected 900, got 1000"}.

Attempt 2: Returns {"status": "success", "stderr": ""}.

6. Deployment Architecture (Cloud Ready)

When moving to production, the SaaS backend is deployed using docker-compose or Kubernetes on the owner's server:

Nginx Reverse Proxy: Handles SSL termination and routes /api to FastAPI.

FastAPI Container: Gunicorn + Uvicorn workers.

PostgreSQL Container: Persistent volume for user data.

Temporal Cluster: Temporal Web UI, Temporal Server, Elasticsearch (for workflow indexing), and Cassandra/PostgreSQL for Temporal state.

Temporal Worker Container: The Python workers that execute the Heavy LLM tasks and interact with the Docker daemon via /var/run/docker.sock to spawn Sandbox containers.