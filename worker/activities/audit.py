"""Audit event activity — writes audit_events table from Temporal activities."""
import logging
from dataclasses import dataclass, field
from typing import Optional
from temporalio import activity
import asyncpg

from config import settings

logger = logging.getLogger(__name__)


@dataclass
class AuditInput:
    job_id: str
    event_type: str
    old_state: Optional[str] = None
    new_state: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    surface: str = "SYSTEM"


@activity.defn
async def write_audit_event(inp: AuditInput) -> None:
    """
    Inserts an audit_events row.
    Also updates refactor_jobs.status to the new state (status = Temporal read projection).
    Per AGENT_DEVELOPMENT_GUIDE.md Section 3.3: status is updated via Temporal activities only.
    """
    activity.heartbeat()

    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(
            """
            INSERT INTO audit_events (job_id, event_type, old_state, new_state, surface, metadata)
            VALUES ($1,$2,$3,$4,$5,$6::jsonb)
            """,
            inp.job_id,
            inp.event_type,
            inp.old_state,
            inp.new_state,
            inp.surface,
            __import__("json").dumps(inp.metadata),
        )

        # Update refactor_jobs.status (read projection of Temporal state)
        if inp.event_type == "job.state_change" and inp.new_state:
            extra_fields = ""
            if inp.new_state in ("DELIVERED", "FAILED", "FALLBACK_REQUIRED"):
                extra_fields = ", completed_at=NOW()"

            failure_reason = inp.metadata.get("reason") if inp.new_state == "FAILED" else None

            if failure_reason:
                await conn.execute(
                    f"""UPDATE refactor_jobs SET status=$1, failure_reason=$2, updated_at=NOW(){extra_fields}
                        WHERE id=$3""",
                    inp.new_state, failure_reason, inp.job_id,
                )
            else:
                await conn.execute(
                    f"UPDATE refactor_jobs SET status=$1, updated_at=NOW(){extra_fields} WHERE id=$2",
                    inp.new_state, inp.job_id,
                )
    finally:
        await conn.close()
