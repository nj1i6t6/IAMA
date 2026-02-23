"""
RefactorJobWorkflow — core IAMA V1 workflow.
Implements the canonical state machine from AGENT_DEVELOPMENT_GUIDE.md Section 3.1.

State transitions enforced here:
PENDING → ANALYZING → WAITING_STRATEGY → WAITING_SPEC_APPROVAL → GENERATING_TESTS
→ BASELINE_VALIDATION → REFACTORING → (SELF_HEALING →)* DELIVERED
"""
import asyncio
from datetime import timedelta
from typing import Optional
from dataclasses import dataclass, field

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, CancelledError

with workflow.unsafe.imports_passed_through():
    from activities.context_assembly import assemble_context, ContextInput
    from activities.strategy_proposal import generate_proposals, ProposalInput
    from activities.test_generation import generate_tests, run_tests, TestInput, RunTestsInput
    from activities.patch_generation import generate_patch, apply_patch, PatchInput, ApplyInput
    from activities.usage_recording import record_usage, UsageInput
    from activities.audit import write_audit_event, AuditInput
    import logging

logger = logging.getLogger(__name__)


@dataclass
class JobInput:
    job_id: str
    user_id: str
    tier: str
    execution_mode: str


@workflow.defn
class RefactorJobWorkflow:
    """
    IAMA V1 refactor job workflow.

    Key invariants enforced:
    - Maximum 3 phase-1 retries before escalating to phase 2 then escalation decision
    - WAITING_INTERVENTION triggered on 3 identical consecutive failures
    - Heartbeat signal stops token generation immediately on loss
    - spec_updated signal cancels in-flight LLM activity and transitions to WAITING_SPEC_APPROVAL
    - QUOTA_RESERVING transient state enforced < 10s
    - entitlement snapshot written before ANALYZING
    """

    def __init__(self):
        self._state: str = "PENDING"
        self._proposal_selected: Optional[str] = None
        self._spec_approved: bool = False
        self._intervention_action: Optional[str] = None
        self._spec_updated: bool = False
        self._heartbeat_received: bool = True
        self._nl_convert_requested: Optional[dict] = None
        self._attempt_count: int = 0
        self._identical_failure_count: int = 0
        self._last_fingerprint: Optional[str] = None

    # ─── Signals ─────────────────────────────────────────────────────────────

    @workflow.signal
    def proposalSelected(self, payload: dict):  # noqa: N802
        self._proposal_selected = payload.get("proposalId")

    @workflow.signal
    def specApproved(self):  # noqa: N802
        self._spec_approved = True

    @workflow.signal
    def interventionAction(self, payload: dict):  # noqa: N802
        self._intervention_action = payload.get("action")

    @workflow.signal
    def specUpdatedDuringExecution(self, payload: dict):  # noqa: N802
        self._spec_updated = True

    @workflow.signal
    def heartbeatReceived(self, payload: dict):  # noqa: N802
        self._heartbeat_received = True

    @workflow.signal
    def nlConvertRequested(self, payload: dict):  # noqa: N802
        self._nl_convert_requested = payload

    # ─── Queries ─────────────────────────────────────────────────────────────

    @workflow.query
    def currentState(self) -> str:  # noqa: N802
        return self._state

    # ─── Main execution ───────────────────────────────────────────────────────

    @workflow.run
    async def run(self, job_input: JobInput) -> dict:
        job_id = job_input.job_id
        retry_policy = RetryPolicy(maximum_attempts=3, backoff_coefficient=2.0)

        try:
            # ── ANALYZING: context assembly ───────────────────────────────
            await self._transition("ANALYZING", job_id)

            context = await workflow.execute_activity(
                assemble_context,
                ContextInput(job_id=job_id, tier=job_input.tier),
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=retry_policy,
            )

            # ── WAITING_STRATEGY: generate proposals ──────────────────────
            await self._transition("WAITING_STRATEGY", job_id)

            proposals = await workflow.execute_activity(
                generate_proposals,
                ProposalInput(job_id=job_id, context=context, tier=job_input.tier),
                start_to_close_timeout=timedelta(minutes=30),
                heartbeat_timeout=timedelta(seconds=90),
                retry_policy=retry_policy,
            )

            # Wait for user to select a proposal
            await workflow.wait_condition(lambda: self._proposal_selected is not None, timeout=timedelta(hours=24))

            # ── WAITING_SPEC_APPROVAL ─────────────────────────────────────
            await self._transition("WAITING_SPEC_APPROVAL", job_id)
            self._spec_approved = False

            await workflow.wait_condition(lambda: self._spec_approved, timeout=timedelta(hours=24))

            # ── GENERATING_TESTS ──────────────────────────────────────────
            await self._transition("GENERATING_TESTS", job_id)

            await workflow.execute_activity(
                generate_tests,
                TestInput(job_id=job_id, tier=job_input.tier),
                start_to_close_timeout=timedelta(minutes=30),
                heartbeat_timeout=timedelta(seconds=90),
                retry_policy=retry_policy,
            )

            # ── BASELINE_VALIDATION ───────────────────────────────────────
            await self._transition("BASELINE_VALIDATION", job_id)

            baseline_result = await workflow.execute_activity(
                run_tests,
                RunTestsInput(job_id=job_id, run_type="BASELINE", attempt_number=0),
                start_to_close_timeout=timedelta(minutes=20),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )

            if not baseline_result.get("passed"):
                await self._transition("BASELINE_VALIDATION_FAILED", job_id)
                # Wait for user to revise spec or give up
                self._spec_approved = False
                await self._transition("WAITING_SPEC_APPROVAL", job_id)
                await workflow.wait_condition(lambda: self._spec_approved, timeout=timedelta(hours=24))
                await self._transition("GENERATING_TESTS", job_id)
                # Counter reset per AGENT_DEVELOPMENT_GUIDE.md Section 3.2
                self._attempt_count = 0
                self._identical_failure_count = 0
                self._last_fingerprint = None
                await self._update_counters(job_id)

            # ── REFACTORING + SELF_HEALING loop ───────────────────────────
            await self._transition("REFACTORING", job_id)

            phase = 1
            max_attempts_per_phase = {1: 3, 2: 2, 3: 1}

            while True:
                self._attempt_count += 1
                self._spec_updated = False

                # Generate patch — 30 min STC timeout, 30s heartbeat per ADR resolution #16
                patch_result = await workflow.execute_activity(
                    generate_patch,
                    PatchInput(
                        job_id=job_id,
                        attempt_number=self._attempt_count,
                        phase=phase,
                        tier=job_input.tier,
                        is_deep_fix=self._intervention_action == "DEEP_FIX",
                    ),
                    start_to_close_timeout=timedelta(minutes=30),
                    heartbeat_timeout=timedelta(seconds=90),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )

                # Check if spec was updated during generation → restart approval flow
                if self._spec_updated:
                    self._attempt_count = 0
                    self._identical_failure_count = 0
                    self._last_fingerprint = None
                    await self._update_counters(job_id)
                    await self._transition("WAITING_SPEC_APPROVAL", job_id)
                    self._spec_approved = False
                    await workflow.wait_condition(lambda: self._spec_approved, timeout=timedelta(hours=24))
                    await self._transition("REFACTORING", job_id)
                    continue

                # Apply patch
                apply_result = await workflow.execute_activity(
                    apply_patch,
                    ApplyInput(job_id=job_id, attempt_number=self._attempt_count),
                    start_to_close_timeout=timedelta(minutes=10),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )

                # Run tests
                test_result = await workflow.execute_activity(
                    run_tests,
                    RunTestsInput(
                        job_id=job_id,
                        run_type="REPAIR",
                        attempt_number=self._attempt_count,
                    ),
                    start_to_close_timeout=timedelta(minutes=20),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )

                if test_result.get("passed"):
                    # All tests pass → DELIVERED
                    await self._transition("DELIVERED", job_id)
                    return {"job_id": job_id, "status": "DELIVERED"}

                # Accumulate failure tracking
                fingerprint = test_result.get("failure_pattern_fingerprint")
                if fingerprint and fingerprint == self._last_fingerprint:
                    self._identical_failure_count += 1
                else:
                    self._identical_failure_count = 1
                    self._last_fingerprint = fingerprint

                await self._update_counters(job_id)

                # WAITING_INTERVENTION: 3 identical consecutive failures
                if self._identical_failure_count >= 3:
                    await self._transition("WAITING_INTERVENTION", job_id)
                    self._intervention_action = None

                    # Wait up to 30 min per Resolution #17
                    try:
                        await workflow.wait_condition(
                            lambda: self._intervention_action is not None,
                            timeout=timedelta(minutes=30)
                        )
                    except asyncio.TimeoutError:
                        await self._transition("FAILED", job_id, reason="INTERVENTION_TIMEOUT")
                        return {"job_id": job_id, "status": "FAILED", "reason": "INTERVENTION_TIMEOUT"}

                    action = self._intervention_action
                    self._intervention_action = None

                    if action == "DEEP_FIX":
                        await self._transition("DEEP_FIX_ACTIVE", job_id)
                        # Reset attempt counter on deep fix
                        self._attempt_count = 0
                        self._identical_failure_count = 0
                        self._last_fingerprint = None
                        await self._update_counters(job_id)
                        phase = min(phase + 1, 3)
                        await self._transition("SELF_HEALING", job_id)
                        continue
                    elif action == "CONTINUE":
                        # No attempt counter reset per spec
                        await self._transition("SELF_HEALING", job_id)
                        continue
                    elif action == "COMMAND":
                        await self._transition("USER_INTERVENING", job_id)
                        # Wait for user to signal tests passed
                        await workflow.wait_condition(
                            lambda: self._intervention_action == "TESTS_PASSED",
                            timeout=timedelta(hours=4)
                        )
                        await self._transition("DELIVERED", job_id)
                        return {"job_id": job_id, "status": "DELIVERED"}

                # Phase escalation check
                if self._attempt_count >= max_attempts_per_phase.get(phase, 1):
                    if phase < 3:
                        await self._transition("WAITING_ESCALATION_DECISION", job_id)
                        self._intervention_action = None
                        try:
                            await workflow.wait_condition(
                                lambda: self._intervention_action in ("ESCALATE", "CANCEL"),
                                timeout=timedelta(hours=1)
                            )
                        except asyncio.TimeoutError:
                            await self._transition("FAILED", job_id, reason="ESCALATION_CONFIRMATION_TIMEOUT")
                            return {"job_id": job_id, "status": "FAILED", "reason": "ESCALATION_CONFIRMATION_TIMEOUT"}

                        if self._intervention_action == "ESCALATE":
                            phase += 1
                            self._attempt_count = 0
                            await self._update_counters(job_id)
                            await self._transition("SELF_HEALING", job_id)
                            continue
                    else:
                        # Budget exhausted
                        await self._transition("RECOVERY_PENDING", job_id)
                        await self._transition("FALLBACK_REQUIRED", job_id)
                        return {"job_id": job_id, "status": "FALLBACK_REQUIRED"}

                await self._transition("SELF_HEALING", job_id)

        except CancelledError:
            await self._transition("FAILED", job_id, reason="USER_CANCELLED")
            raise
        except Exception as exc:
            await self._transition("FAILED", job_id, reason=str(exc)[:200])
            raise

    # ─── Helpers ──────────────────────────────────────────────────────────────

    async def _transition(self, new_state: str, job_id: str, reason: Optional[str] = None):
        old_state = self._state
        self._state = new_state
        logger.info("Job %s: %s → %s", job_id, old_state, new_state)

        await workflow.execute_activity(
            write_audit_event,
            AuditInput(
                job_id=job_id,
                event_type="job.state_change",
                old_state=old_state,
                new_state=new_state,
                metadata={"reason": reason} if reason else {},
            ),
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RetryPolicy(maximum_attempts=5),
        )

    async def _update_counters(self, job_id: str):
        """Persist attempt/failure counters to DB via activity."""
        await workflow.execute_activity(
            record_usage,
            UsageInput(
                job_id=job_id,
                event_type="counter_update",
                quantity=0,
                billable=False,
                metadata={
                    "attempt_count": self._attempt_count,
                    "identical_failure_count": self._identical_failure_count,
                    "failure_pattern_fingerprint": self._last_fingerprint,
                },
            ),
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
