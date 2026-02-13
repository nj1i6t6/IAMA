from __future__ import annotations

from datetime import timedelta

from fastapi import FastAPI
from pydantic import BaseModel, Field
from temporalio.client import Client

from workflows.migration_workflow import MigrationWorkflow

TASK_QUEUE = "iama-migration-task-queue"

app = FastAPI(title="IAMA Backend API", version="0.1.0")


class MigrateRequest(BaseModel):
    repo_url: str = Field(min_length=1)


class MigrateResponse(BaseModel):
    workflow_id: str
    run_id: str


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/migrate", response_model=MigrateResponse)
async def migrate(payload: MigrateRequest) -> MigrateResponse:
    client = await Client.connect("localhost:7233")
    handle = await client.start_workflow(
        MigrationWorkflow.run,
        payload.repo_url,
        id=f"migration-{abs(hash(payload.repo_url))}",
        task_queue=TASK_QUEUE,
        execution_timeout=timedelta(minutes=10),
    )
    return MigrateResponse(workflow_id=handle.id, run_id=handle.result_run_id)
