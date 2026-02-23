"""
Context assembly activity — gathers file contents, AST info, and builds
the LLM context payload for the refactor job.

AST confidence formula (AGENT_DEVELOPMENT_GUIDE.md resolution #22):
  round(0.40 × parse_rate + 0.35 × symbol_rate + 0.25 × snippet_completeness) × 100
  ≥ 40  → AST_SYMBOLIC
  20–39 → BLACK_BOX (overridable)
  < 20  → EXACT_SEARCH_REPLACE only
"""
import logging
from dataclasses import dataclass
from typing import Optional, List
from temporalio import activity


logger = logging.getLogger(__name__)


@dataclass
class ContextInput:
    job_id: str
    tier: str


@activity.defn
async def assemble_context(inp: ContextInput) -> dict:
    """
    Assembles the execution context for a refactor job.
    Reads target paths, computes AST confidence score, selects baseline mode.
    """
    activity.heartbeat()

    logger.info("Assembling context for job %s (tier=%s)", inp.job_id, inp.tier)

    # In the full implementation this queries target_paths from the DB,
    # reads the actual file contents via the IDE extension file-sync protocol,
    # then computes the AST confidence score.
    # The stub returns a representative context dict.

    context = {
        "job_id":         inp.job_id,
        "tier":           inp.tier,
        "file_count":     0,
        "total_tokens":   0,
        "ast_score":      0,
        "baseline_mode":  "AST_SYMBOLIC",
        "target_files":   [],
    }

    activity.heartbeat()
    logger.info("Context assembled for job %s: %s", inp.job_id, context)
    return context
