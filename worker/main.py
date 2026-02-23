"""
IAMA Temporal Worker — entry point.
Registers all workflows and activities, starts the worker process.
"""
import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker

from config import settings
from workflows.refactor_job_workflow import RefactorJobWorkflow
from workflows.revert_workflow import RevertWorkflow
from activities.context_assembly import assemble_context
from activities.strategy_proposal import generate_proposals
from activities.spec_generation import convert_nl_to_spec
from activities.test_generation import generate_tests, run_tests
from activities.patch_generation import generate_patch, apply_patch
from activities.usage_recording import record_usage, write_entitlement_snapshot
from activities.audit import write_audit_event

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger(__name__)


async def main():
    logger.info("Connecting to Temporal at %s", settings.temporal_address)
    client = await Client.connect(
        settings.temporal_address,
        namespace=settings.temporal_namespace,
    )

    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[RefactorJobWorkflow, RevertWorkflow],
        activities=[
            assemble_context,
            generate_proposals,
            convert_nl_to_spec,
            generate_tests,
            run_tests,
            generate_patch,
            apply_patch,
            record_usage,
            write_entitlement_snapshot,
            write_audit_event,
        ],
        max_concurrent_activities=10,
        max_concurrent_workflow_tasks=20,
    )

    logger.info("Worker starting on task queue: %s", settings.temporal_task_queue)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
