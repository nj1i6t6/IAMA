"""
Strategy proposal generation.
All LLM calls go through LiteLLM to never call providers directly (ADR-002).
Streaming is wrapped in asyncio.Task with cancellation support.
"""
import asyncio
import logging
from dataclasses import dataclass
from typing import Any
from temporalio import activity
import httpx

from config import settings


logger = logging.getLogger(__name__)

L1_MODEL = "auto"   # LiteLLM resolves to L1 via IAMA Router


@dataclass
class ProposalInput:
    job_id: str
    context: dict
    tier: str


@activity.defn
async def generate_proposals(inp: ProposalInput) -> list:
    """
    Calls LiteLLM (L1 model by default) to generate refactor strategy proposals.

    Streaming cancellation (AGENT_DEVELOPMENT_GUIDE.md Section 1.2):
    - LiteLLM streaming is wrapped in asyncio.Task
    - On Temporal cancellation, asyncio.Task is cancelled before full stream completes
    - This closes the underlying HTTP connection and stops token burn
    """
    activity.heartbeat()
    logger.info("Generating proposals for job %s", inp.job_id)

    proposals: list = []

    async def _stream_proposals():
        nonlocal proposals
        async with httpx.AsyncClient(base_url=settings.litellm_api_base, timeout=120.0) as client:
            payload = {
                "model":    "iama-router-l1",
                "messages": [
                    {"role": "system",  "content": "You are IAMA, a senior refactoring strategist."},
                    {"role": "user",    "content": f"Generate 3 refactoring strategy proposals for job {inp.job_id}."},
                ],
                "stream":   True,
                "max_tokens": 2000,
            }
            full_text = ""
            async with client.stream("POST", "/v1/chat/completions", json=payload) as response:
                async for chunk in response.aiter_text():
                    # Check Temporal cancellation on each chunk (mandatory per ADR-002)
                    if activity.is_cancelled():
                        return
                    activity.heartbeat()
                    full_text += chunk

            proposals = [
                {"id": f"{inp.job_id}-p1", "title": "Proposal 1 (LLM)", "description": full_text[:500]},
            ]

    task = asyncio.create_task(_stream_proposals())
    try:
        await task
    except asyncio.CancelledError:
        task.cancel()
        raise

    return proposals
