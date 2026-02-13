from __future__ import annotations

import asyncio

from temporalio import activity


@activity.defn
async def analyze_repo_activity(repo_url: str) -> str:
    _ = repo_url
    await asyncio.sleep(2)
    return "Analysis Complete"
