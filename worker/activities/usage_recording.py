"""
Usage recording and entitlement snapshot activities.
All usage_ledger inserts use ON CONFLICT DO NOTHING with idempotency_key (invariant #7).
Entitlement snapshot written before ANALYZING (invariant #10).
"""
import logging
from dataclasses import dataclass, field
from typing import Optional
from temporalio import activity
import asyncpg

from config import settings

logger = logging.getLogger(__name__)


@dataclass
class UsageInput:
    job_id: str
    event_type: str
    quantity: int
    billable: bool
    idempotency_key: Optional[str] = None
    metadata: Optional[dict] = None


@activity.defn
async def record_usage(inp: UsageInput) -> None:
    """
    Writes a usage_ledger row idempotently.
    Also handles counter_update events by updating refactor_jobs fields.
    """
    activity.heartbeat()

    conn = await asyncpg.connect(settings.database_url)
    try:
        if inp.event_type == "counter_update":
            meta = inp.metadata or {}
            await conn.execute(
                """UPDATE refactor_jobs
                   SET attempt_count=$1, identical_failure_count=$2,
                       failure_pattern_fingerprint=$3, updated_at=NOW()
                   WHERE id=$4""",
                meta.get("attempt_count", 0),
                meta.get("identical_failure_count", 0),
                meta.get("failure_pattern_fingerprint"),
                inp.job_id,
            )
            return

        if not inp.idempotency_key:
            return

        job_row = await conn.fetchrow("SELECT owner_id FROM refactor_jobs WHERE id=$1", inp.job_id)
        if not job_row:
            return

        await conn.execute(
            """
            INSERT INTO usage_ledger (user_id, job_id, event_type, quantity, billable, idempotency_key)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (idempotency_key) DO NOTHING
            """,
            str(job_row["owner_id"]),
            inp.job_id,
            inp.event_type,
            inp.quantity,
            inp.billable,
            inp.idempotency_key,
        )
    finally:
        await conn.close()


@dataclass
class EntitlementInput:
    job_id: str


@activity.defn
async def write_entitlement_snapshot(inp: EntitlementInput) -> None:
    """
    Writes immutable entitlement_snapshot row before job enters ANALYZING.
    Invariant #10: entitlement_snapshots must be written before a job enters ANALYZING.
    """
    activity.heartbeat()

    conn = await asyncpg.connect(settings.database_url)
    try:
        job_row = await conn.fetchrow(
            "SELECT owner_id, execution_mode FROM refactor_jobs WHERE id=$1", inp.job_id
        )
        if not job_row:
            return

        sub_row = await conn.fetchrow(
            """SELECT tier, operating_mode, context_cap
               FROM subscription_tiers WHERE user_id=$1 AND status='ACTIVE'
               ORDER BY created_at DESC LIMIT 1""",
            str(job_row["owner_id"]),
        )

        tier           = sub_row["tier"]           if sub_row else "FREE"
        operating_mode = sub_row["operating_mode"] if sub_row else "SIMPLE"
        context_cap    = sub_row["context_cap"]    if sub_row else 128000

        await conn.execute(
            """
            INSERT INTO entitlement_snapshots
              (job_id, user_id, tier, operating_mode, execution_mode,
               phase_limits, web_github_enabled, context_cap)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (job_id) DO NOTHING
            """,
            inp.job_id,
            str(job_row["owner_id"]),
            tier,
            operating_mode,
            str(job_row["execution_mode"]),
            '{"phase1":null,"phase2":null,"phase3":null}',
            tier == "ENTERPRISE",
            context_cap,
        )
    finally:
        await conn.close()
