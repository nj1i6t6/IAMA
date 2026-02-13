from __future__ import annotations

from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from activities.analysis import analyze_repo_activity


@workflow.defn
class MigrationWorkflow:
    @workflow.run
    async def run(self, repo_url: str) -> str:
        analysis_result = await workflow.execute_activity(
            analyze_repo_activity,
            repo_url,
            schedule_to_close_timeout=timedelta(seconds=30),
        )
        return f"Migration workflow completed: {analysis_result}"
