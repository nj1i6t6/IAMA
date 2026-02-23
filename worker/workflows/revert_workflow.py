"""RevertWorkflow — applies reverse patch to workspace when user requests revert."""
from datetime import timedelta
from dataclasses import dataclass
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.audit import write_audit_event, AuditInput


@dataclass
class RevertInput:
    job_id: str
    user_id: str


@workflow.defn
class RevertWorkflow:
    @workflow.run
    async def run(self, inp: RevertInput) -> dict:
        await workflow.execute_activity(
            write_audit_event,
            AuditInput(
                job_id=inp.job_id,
                event_type="delivery.revert.started",
                old_state="DELIVERED",
                new_state="DELIVERED",
                metadata={"user_id": inp.user_id},
            ),
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
        # The actual filesystem reverse patch is applied by the IDE extension
        # (it holds the patched files and the original backup) — the workflow
        # merely records intent and writes audit trail.
        return {"job_id": inp.job_id, "reverted": True}
