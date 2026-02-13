from __future__ import annotations

from temporalio.client import Client
from temporalio.worker import Worker

from activities.analysis import analyze_repo_activity
from workflows.migration_workflow import MigrationWorkflow

TASK_QUEUE = "iama-migration-task-queue"


async def main() -> None:
    client = await Client.connect("localhost:7233")
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[MigrationWorkflow],
        activities=[analyze_repo_activity],
    )
    await worker.run()


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
