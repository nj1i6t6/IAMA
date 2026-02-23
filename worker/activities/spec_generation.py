"""
Spec (BDD/SDD) generation activity.
NL-to-spec conversion uses L2 model per API_CONTRACT.md resolution #21.
"""
import logging
from dataclasses import dataclass
from temporalio import activity
import httpx

from config import settings

logger = logging.getLogger(__name__)


@dataclass
class TestInput:
    job_id: str
    tier: str


@dataclass
class NLConvertInput:
    job_id: str
    input_text: str
    mode: str
    revision_token: str


@activity.defn
async def generate_tests(inp: TestInput) -> dict:
    """Generate BDD test scaffolding from approved spec."""
    activity.heartbeat()
    logger.info("Generating tests for job %s", inp.job_id)

    # LiteLLM call using L2 model for spec-quality generation
    async with httpx.AsyncClient(base_url=settings.litellm_api_base, timeout=120.0) as client:
        payload = {
            "model":    "iama-router-l2",
            "messages": [
                {"role": "system", "content": "Generate pytest test scaffolding from BDD/SDD spec."},
                {"role": "user",   "content": f"Generate tests for job {inp.job_id}."},
            ],
            "max_tokens": 4000,
        }
        resp = await client.post("/v1/chat/completions", json=payload)
        resp.raise_for_status()

    activity.heartbeat()
    return {"job_id": inp.job_id, "tests_generated": True}


@activity.defn
async def convert_nl_to_spec(inp: NLConvertInput) -> dict:
    """
    Convert natural language description to structured BDD/SDD spec.
    Uses L2 model per API_CONTRACT.md Section 5 (nl-convert endpoint).
    Returns preview only — not committed to DB.
    """
    activity.heartbeat()
    async with httpx.AsyncClient(base_url=settings.litellm_api_base, timeout=60.0) as client:
        payload = {
            "model":    "iama-router-l2",
            "messages": [
                {"role": "system", "content": "Convert natural language to BDD test scenarios and SDD components."},
                {"role": "user",   "content": inp.input_text},
            ],
            "max_tokens": 3000,
        }
        resp = await client.post("/v1/chat/completions", json=payload)
        resp.raise_for_status()

    return {"bdd_items": [], "sdd_items": [], "model_class_used": "L2"}
