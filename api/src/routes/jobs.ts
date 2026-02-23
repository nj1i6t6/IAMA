import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db, withAdvisoryLock } from '../db/pool';
import { writeAuditEvent } from '../lib/audit';
import { getTemporalClient } from '../lib/temporal';
import { logger } from '../lib/logger';
import config from '../config';

// ─── Quota gate ───────────────────────────────────────────────────────────────

async function checkAndReserveQuota(
    userId: string,
    jobId: string,
    tier: string
): Promise<{ ok: boolean; errorCode?: string; retryAfter?: string }> {
    return withAdvisoryLock(`quota:${userId}`, async (client) => {
        // AGENT_DEVELOPMENT_GUIDE.md Section 2.3 Rule 1: Two-layer gate
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        // Layer 1: daily job count
        const { rows: dailyRows } = await (client as any).query<{ cnt: string }>(
            `SELECT COUNT(*) as cnt FROM refactor_jobs
       WHERE owner_id=$1 AND created_at >= $2 AND status != 'FAILED'`,
            [userId, todayStart]
        );
        const dailyCount = Number(dailyRows[0]?.cnt ?? 0);
        const limits: Record<string, number> = { FREE: 3, PLUS: 8, PRO: 20, MAX: 40, ENTERPRISE: 9999 };
        const dailyLimit = limits[tier] ?? 3;

        if (dailyCount >= dailyLimit) {
            return {
                ok: false, errorCode: 'QUOTA_EXCEEDED_DAILY',
                retryAfter: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
            };
        }

        // Layer 2: monthly credits (not applicable to FREE)
        if (tier !== 'FREE') {
            const { rows: [sub] } = await (client as any).query<{ billing_cycle_start: string; billing_cycle_end: string }>(
                `SELECT billing_cycle_start, billing_cycle_end FROM subscription_tiers
         WHERE user_id=$1 AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`, [userId]
            );
            if (sub) {
                const { rows: usageRows } = await (client as any).query<{ total: string }>(
                    `SELECT SUM(quantity) as total FROM usage_ledger
           WHERE user_id=$1 AND recorded_at >= $2 AND recorded_at < $3 AND billable=true`,
                    [userId, sub.billing_cycle_start, sub.billing_cycle_end]
                );
                const used = Number(usageRows[0]?.total ?? 0);
                const monthlyLimits: Record<string, number | null> = { PLUS: 280, PRO: 650, MAX: 1500, ENTERPRISE: null };
                const monthlyLimit = monthlyLimits[tier] ?? null;
                if (monthlyLimit !== null && (monthlyLimit - used) < 10) {
                    return { ok: false, errorCode: 'QUOTA_EXCEEDED_MONTHLY' };
                }
            }
        }

        // Reserve quota
        const idempotencyKey = `${userId}:${jobId}:phase1`;
        await (client as any).query(
            `INSERT INTO quota_reservations (user_id, job_id, phase, status, idempotency_key, lock_owner)
       VALUES ($1, $2, 1, 'RESERVED', $3, $4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
            [userId, jobId, idempotencyKey, process.env.HOSTNAME ?? 'api']
        );

        return { ok: true };
    });
}

// ─── Job routes ───────────────────────────────────────────────────────────────

const CreateJobSchema = z.object({
    project_id: z.string().uuid().optional(),
    target_paths: z.array(z.string()).min(1),
    execution_mode: z.enum(['LOCAL_DOCKER', 'LOCAL_NATIVE', 'REMOTE_SANDBOX']),
    refactor_context: z.string().max(4000).optional(),
});

export async function jobRoutes(app: FastifyInstance) {

    // POST /api/v1/jobs — V1-FR-JOB-001
    app.post('/jobs', async (request, reply) => {
        const userId = request.user!.user_id;
        const tier = request.user!.tier;

        const parsed = CreateJobSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', details: parsed.error.flatten() } });
        }
        const body = parsed.data;

        // Entitlement: REMOTE_SANDBOX requires Pro+
        if (body.execution_mode === 'REMOTE_SANDBOX' && ['FREE', 'PLUS'].includes(tier)) {
            return reply.status(403).send({
                error: {
                    code: 'ENTITLEMENT_DENIED', message: 'Remote sandbox requires Pro tier or above.',
                    details: { denial_reason: 'EXECUTION_ENVIRONMENT_NOT_ENTITLED' }
                },
            });
        }

        const jobId = uuidv4();
        const artifactExpiresAt = new Date(Date.now() + config.artifactTtlDays * 86400_000).toISOString();

        await db.query(
            `INSERT INTO refactor_jobs (id, owner_id, project_id, execution_mode, target_paths, refactor_context, artifact_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [jobId, userId, body.project_id ?? null, body.execution_mode, body.target_paths, body.refactor_context ?? null, artifactExpiresAt]
        );

        // Pre-reserve quota
        const quotaResult = await checkAndReserveQuota(userId, jobId, tier);
        if (!quotaResult.ok) {
            await db.query(`DELETE FROM refactor_jobs WHERE id=$1`, [jobId]);
            return reply.status(429).send({
                error: { code: quotaResult.errorCode!, message: 'Quota exceeded.', details: {} },
                retry_after: quotaResult.retryAfter,
            });
        }

        await writeAuditEvent({ actorId: userId, jobId, eventType: 'job.created', newState: 'PENDING', surface: 'API' });

        logger.info({ jobId, userId, tier }, 'Job created');
        const { rows: [job] } = await db.query<{ created_at: string }>(
            'SELECT created_at FROM refactor_jobs WHERE id=$1', [jobId]
        );

        return reply.status(201).send({
            job_id: jobId, status: 'PENDING', created_at: job.created_at,
            quota_reservation_id: `${userId}:${jobId}:phase1`,
        });
    });

    // GET /api/v1/jobs — list jobs for current user
    app.get('/jobs', async (request, reply) => {
        const userId = request.user!.user_id;
        const q = request.query as { limit?: string; offset?: string; status?: string };
        const limit = Math.min(Number(q.limit ?? 20), 100);
        const offset = Number(q.offset ?? 0);

        let whereClause = 'WHERE owner_id=$1';
        const params: any[] = [userId];
        if (q.status) { whereClause += ` AND status=$${params.push(q.status)}`; }

        const { rows: items } = await db.query(
            `SELECT id as job_id, status, created_at, updated_at, target_paths, execution_mode,
              current_phase, attempt_count, artifact_expires_at
       FROM refactor_jobs ${whereClause}
       ORDER BY created_at DESC LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
            params
        );
        const { rows: [cnt] } = await db.query<{ total: string }>(
            `SELECT COUNT(*) as total FROM refactor_jobs ${whereClause}`, params.slice(0, q.status ? 2 : 1)
        );

        return reply.send({ items, total: Number(cnt.total), has_more: offset + limit < Number(cnt.total) });
    });

    // GET /api/v1/jobs/:job_id
    app.get('/jobs/:job_id', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;

        const { rows } = await db.query<any>(
            `SELECT rj.id, rj.status, rj.created_at, rj.updated_at, rj.target_paths, rj.execution_mode,
              rj.current_phase, rj.attempt_count, rj.identical_failure_count,
              rj.failure_pattern_fingerprint, rj.baseline_mode_used, rj.artifact_expires_at,
              rj.failure_reason, rj.owner_id,
              chs.status as heartbeat_status, chs.last_seen_at as last_heartbeat_at, chs.grace_deadline_at
       FROM refactor_jobs rj
       LEFT JOIN client_heartbeat_sessions chs ON chs.job_id = rj.id AND chs.status IN ('ACTIVE','GRACE_PERIOD')
       WHERE rj.id=$1`,
            [job_id]
        );

        if (!rows[0]) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found.', details: {} } });
        if (rows[0].owner_id !== userId) {
            return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });
        }

        const j = rows[0];
        return reply.send({
            job_id: j.id, status: j.status, created_at: j.created_at, updated_at: j.updated_at,
            target_paths: j.target_paths, execution_mode: j.execution_mode,
            current_phase: j.current_phase, attempt_count: j.attempt_count,
            identical_failure_count: j.identical_failure_count,
            failure_pattern_fingerprint: j.failure_pattern_fingerprint,
            baseline_mode: j.baseline_mode_used ?? null,
            artifact_expires_at: j.artifact_expires_at ?? null,
            heartbeat_status: j.heartbeat_status ?? null,
            last_heartbeat_at: j.last_heartbeat_at ?? null,
            grace_deadline_at: j.grace_deadline_at ?? null,
        });
    });

    // POST /api/v1/jobs/:job_id/start
    app.post('/jobs/:job_id/start', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;

        const { rows: [job] } = await db.query<{ status: string; owner_id: string; execution_mode: string }>(
            'SELECT status, owner_id, execution_mode FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found.', details: {} } });
        if (job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });
        if (job.status !== 'PENDING') return reply.status(409).send({ error: { code: 'JOB_STATE_INVALID', message: 'Job can only be started from PENDING.', details: {} } });

        // Write entitlement snapshot before ANALYZING
        const { rows: [sub] } = await db.query<any>(
            `SELECT tier, operating_mode, context_cap FROM subscription_tiers
       WHERE user_id=$1 AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`, [userId]
        );
        const tier = sub?.tier ?? 'FREE';
        await db.query(
            `INSERT INTO entitlement_snapshots (job_id, user_id, tier, operating_mode, execution_mode, phase_limits, web_github_enabled, context_cap)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (job_id) DO NOTHING`,
            [job_id, userId, tier, sub?.operating_mode ?? 'SIMPLE', job.execution_mode,
                JSON.stringify({ daily_limit: null, monthly_phase2: null, monthly_phase3: null }),
                tier === 'ENTERPRISE', sub?.context_cap ?? 128000]
        );

        // Start Temporal workflow
        try {
            const client = await getTemporalClient();
            await client.workflow.start('RefactorJobWorkflow', {
                taskQueue: config.temporal.taskQueue,
                workflowId: `job-${job_id}`,
                args: [{ jobId: job_id, userId, tier, executionMode: job.execution_mode }],
            });
        } catch (err: any) {
            logger.error({ err, jobId: job_id }, 'Failed to start Temporal workflow');
            return reply.status(409).send({ error: { code: 'QUOTA_RESERVATION_FAILED', message: 'Failed to start workflow.', details: { denial_reason: err.message } } });
        }

        await db.query('UPDATE refactor_jobs SET status=$1, updated_at=NOW() WHERE id=$2', ['ANALYZING', job_id]);
        await writeAuditEvent({ actorId: userId, jobId: job_id, eventType: 'job.started', oldState: 'PENDING', newState: 'ANALYZING', surface: 'API' });

        return reply.send({ job_id, status: 'ANALYZING' });
    });

    // DELETE /api/v1/jobs/:job_id
    app.delete('/jobs/:job_id', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: [job] } = await db.query<{ status: string; owner_id: string }>(
            'SELECT status, owner_id FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found.', details: {} } });
        if (job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        try {
            const client = await getTemporalClient();
            const handle = client.workflow.getHandle(`job-${job_id}`);
            await handle.cancel();
        } catch { /* workflow may not exist yet */ }

        await db.query(
            `UPDATE refactor_jobs SET status='FAILED', failure_reason='USER_CANCELLED', updated_at=NOW(), completed_at=NOW() WHERE id=$1`, [job_id]
        );
        await writeAuditEvent({ actorId: userId, jobId: job_id, eventType: 'job.cancelled', oldState: job.status, newState: 'FAILED', surface: 'API' });

        return reply.send({ job_id, status: 'FAILED', failure_reason: 'USER_CANCELLED' });
    });

    // POST /api/v1/jobs/:job_id/heartbeat — V1-FR-JOB-007
    app.post('/jobs/:job_id/heartbeat', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const { session_id } = request.body as { session_id?: string };
        const userId = request.user!.user_id;

        if (!session_id) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'session_id required.', details: {} } });

        const { rows: [job] } = await db.query<{ owner_id: string }>(
            'SELECT owner_id FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) {
            return reply.status(404).send({ error: { code: 'JOB_NOT_FOUND', message: 'Not found.', details: {} } });
        }

        await db.query(
            `INSERT INTO client_heartbeat_sessions (job_id, session_id, workflow_run_id, status)
       VALUES ($1,$2,$3,'ACTIVE')
       ON CONFLICT (job_id, session_id) DO UPDATE
         SET status='ACTIVE', last_seen_at=NOW(), grace_deadline_at=NULL, updated_at=NOW()`,
            [job_id, session_id, `job-${job_id}`]
        );

        // Signal Temporal
        try {
            const client = await getTemporalClient();
            const handle = client.workflow.getHandle(`job-${job_id}`);
            await handle.signal('heartbeatReceived', { sessionId: session_id, timestamp: new Date().toISOString() });
        } catch { /* workflow may be terminal */ }

        return reply.send({ acknowledged: true, grace_deadline_at: null });
    });

    // POST /api/v1/jobs/:job_id/force-terminate
    app.post('/jobs/:job_id/force-terminate', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: [job] } = await db.query<{ owner_id: string; status: string }>(
            'SELECT owner_id, status FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found.', details: {} } });
        try {
            const client = await getTemporalClient();
            await client.workflow.getHandle(`job-${job_id}`).terminate('Force terminated by user');
        } catch { /* ignore */ }
        await db.query(`UPDATE refactor_jobs SET status='FAILED', failure_reason='FORCE_TERMINATED_BY_USER', updated_at=NOW(), completed_at=NOW() WHERE id=$1`, [job_id]);
        await writeAuditEvent({ actorId: userId, jobId: job_id, eventType: 'job.force_terminated', oldState: job.status, newState: 'FAILED', surface: 'API' });
        return reply.send({ job_id, status: 'FAILED', failure_reason: 'FORCE_TERMINATED_BY_USER' });
    });

    // GET /api/v1/jobs/:job_id/proposals
    app.get('/jobs/:job_id/proposals', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: [job] } = await db.query<{ owner_id: string; status: string }>(
            'SELECT owner_id, status FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        const { rows } = await db.query<any>(
            `SELECT ja.storage_key, ja.artifact_type, ja.created_at
       FROM job_artifacts ja WHERE ja.job_id=$1 AND ja.artifact_type='PATCH'
       ORDER BY ja.created_at ASC`, [job_id]
        );

        // Proposals are stored as job_artifacts of type PATCH during WAITING_STRATEGY
        // Real impl returns from Temporal signal result; stub returns empty set if not ready
        return reply.send({ proposals: [] });
    });

    // POST /api/v1/jobs/:job_id/proposals/select
    app.post('/jobs/:job_id/proposals/select', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { proposal_id } = request.body as { proposal_id?: string };
        if (!proposal_id) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'proposal_id required.', details: {} } });

        const { rows: [job] } = await db.query<{ owner_id: string; status: string }>(
            'SELECT owner_id, status FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });
        if (job.status !== 'WAITING_STRATEGY') return reply.status(409).send({ error: { code: 'JOB_STATE_INVALID', message: 'Job must be in WAITING_STRATEGY.', details: {} } });

        try {
            const client = await getTemporalClient();
            await client.workflow.getHandle(`job-${job_id}`).signal('proposalSelected', { proposalId: proposal_id });
        } catch (err) {
            logger.error({ err }, 'Failed to signal proposal selection');
        }

        return reply.send({ job_id, status: 'WAITING_SPEC_APPROVAL' });
    });

    // GET /api/v1/jobs/:job_id/spec
    app.get('/jobs/:job_id/spec', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: [job] } = await db.query<{ owner_id: string }>(
            'SELECT owner_id FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        const { rows: [rev] } = await db.query<any>(
            `SELECT id, revision_token, bdd_snapshot, sdd_snapshot, created_at
       FROM spec_revisions WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`, [job_id]
        );

        if (!rev) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No spec yet.', details: {} } });

        return reply.send({
            bdd_items: rev.bdd_snapshot,
            sdd_items: rev.sdd_snapshot,
            revision_id: rev.id,
            revision_token: rev.revision_token,
            updated_at: rev.created_at,
        });
    });

    // PATCH /api/v1/jobs/:job_id/spec — V1-FR-SPEC-002
    app.patch('/jobs/:job_id/spec', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const body = request.body as { revision_token?: string; bdd_items?: any[]; sdd_items?: any[] };

        if (!body.revision_token) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'revision_token required.', details: {} } });

        const { rows: [job] } = await db.query<{ owner_id: string; status: string }>(
            'SELECT owner_id, status FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        const { rows: [current] } = await db.query<{ revision_token: string; bdd_snapshot: any; sdd_snapshot: any }>(
            'SELECT revision_token, bdd_snapshot, sdd_snapshot FROM spec_revisions WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1', [job_id]
        );

        if (!current || current.revision_token !== body.revision_token) {
            return reply.status(409).send({
                error: { code: 'SPEC_REVISION_CONFLICT', message: 'Revision token mismatch.', details: {} },
                current_revision_token: current?.revision_token,
                diff_payload: {},
            });
        }

        const newRevisionToken = uuidv4();
        const bddSnapshot = body.bdd_items ?? current.bdd_snapshot;
        const sddSnapshot = body.sdd_items ?? current.sdd_snapshot;

        const { rows: [newRev] } = await db.query<{ id: string }>(
            `INSERT INTO spec_revisions (job_id, revision_token, actor_id, surface, bdd_snapshot, sdd_snapshot)
       VALUES ($1,$2,$3,'IDE',$4,$5) RETURNING id`,
            [job_id, newRevisionToken, userId, JSON.stringify(bddSnapshot), JSON.stringify(sddSnapshot)]
        );

        await writeAuditEvent({ actorId: userId, jobId: job_id, eventType: 'spec.updated', surface: 'IDE' });

        // Signal if execution is in-flight
        if (['REFACTORING', 'SELF_HEALING'].includes(job.status)) {
            try {
                const client = await getTemporalClient();
                await client.workflow.getHandle(`job-${job_id}`).signal('specUpdatedDuringExecution', { revisionId: newRev.id });
            } catch { /* ignore */ }
        }

        return reply.send({ revision_id: newRev.id, revision_token: newRevisionToken });
    });

    // POST /api/v1/jobs/:job_id/spec/nl-convert
    app.post('/jobs/:job_id/spec/nl-convert', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const body = request.body as { natural_language_input?: string; mode?: string; revision_token?: string };

        if (!body.natural_language_input || !body.revision_token) {
            return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'natural_language_input and revision_token required.', details: {} } });
        }

        const { rows: [job] } = await db.query<{ owner_id: string }>('SELECT owner_id FROM refactor_jobs WHERE id=$1', [job_id]);
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        // NL conversion is performed by Temporal worker activity via L2 model
        // The API signals the workflow and polls for the result asynchronously
        // For the immediate response, kick off the activity and return placeholder
        try {
            const client = await getTemporalClient();
            await client.workflow.getHandle(`job-${job_id}`).signal('nlConvertRequested', {
                input: body.natural_language_input,
                mode: body.mode ?? 'BOTH',
                revisionToken: body.revision_token,
            });
        } catch { /* workflow may not be running */ }

        return reply.send({
            bdd_items: [],
            sdd_items: [],
            model_class_used: 'L2',
        });
    });

    // POST /api/v1/jobs/:job_id/spec/approve
    app.post('/jobs/:job_id/spec/approve', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: [job] } = await db.query<{ owner_id: string; status: string }>(
            'SELECT owner_id, status FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });
        if (job.status !== 'WAITING_SPEC_APPROVAL') return reply.status(409).send({ error: { code: 'JOB_STATE_INVALID', message: 'Job must be in WAITING_SPEC_APPROVAL.', details: {} } });

        try {
            const client = await getTemporalClient();
            await client.workflow.getHandle(`job-${job_id}`).signal('specApproved');
        } catch (err) {
            logger.error({ err }, 'Failed to signal spec approval');
        }

        return reply.send({ job_id, status: 'GENERATING_TESTS' });
    });

    // GET /api/v1/jobs/:job_id/logs — SSE stream
    app.get('/jobs/:job_id/logs', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: [job] } = await db.query<{ owner_id: string }>(
            'SELECT owner_id FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });

        const sendEvent = (data: object) => {
            reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Send current state immediately
        const { rows: [current] } = await db.query<{ status: string }>(
            'SELECT status FROM refactor_jobs WHERE id=$1', [job_id]
        );
        sendEvent({ event: 'state_change', state: current?.status, timestamp: new Date().toISOString() });

        // Keep-alive heartbeat
        const keepAlive = setInterval(() => {
            reply.raw.write(': keep-alive\n\n');
        }, 15_000);

        request.raw.on('close', () => {
            clearInterval(keepAlive);
        });
    });

    // GET /api/v1/jobs/:job_id/delivery
    app.get('/jobs/:job_id/delivery', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: [job] } = await db.query<{ owner_id: string; status: string; artifact_expires_at: string; baseline_mode_used: string }>(
            'SELECT owner_id, status, artifact_expires_at, baseline_mode_used FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });
        if (job.status !== 'DELIVERED') return reply.status(409).send({ error: { code: 'JOB_STATE_INVALID', message: 'Job not delivered yet.', details: {} } });

        return reply.send({
            diff_files: [],
            patch_artifact_url: null,
            artifact_expires_at: job.artifact_expires_at,
            baseline_mode_used: job.baseline_mode_used,
            baseline_risk_note: null,
            can_revert: true,
        });
    });

    // POST /api/v1/jobs/:job_id/delivery/apply — V1-FR-DEL-005
    app.post('/jobs/:job_id/delivery/apply', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const body = request.body as { accept_all?: boolean; accepted_files?: string[]; accepted_hunks?: any[] };
        const { rows: [job] } = await db.query<{ owner_id: string; status: string }>(
            'SELECT owner_id, status FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });
        await writeAuditEvent({ actorId: userId, jobId: job_id, eventType: 'delivery.applied', surface: 'IDE' });
        return reply.send({ applied_files: body.accepted_files ?? [], skipped_files: [], revert_available_until: null });
    });

    // POST /api/v1/jobs/:job_id/delivery/revert — V1-FR-DEL-007
    app.post('/jobs/:job_id/delivery/revert', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: [job] } = await db.query<{ owner_id: string }>(
            'SELECT owner_id FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        try {
            const client = await getTemporalClient();
            await client.workflow.start('RevertWorkflow', {
                taskQueue: config.temporal.taskQueue,
                workflowId: `revert-${job_id}`,
                args: [{ jobId: job_id, userId }],
            });
        } catch { /* log only */ }

        await writeAuditEvent({ actorId: userId, jobId: job_id, eventType: 'delivery.reverted', surface: 'IDE' });
        return reply.send({ reverted: true });
    });

    // GET /api/v1/jobs/:job_id/fallback
    app.get('/jobs/:job_id/fallback', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: [job] } = await db.query<{ owner_id: string; identical_failure_count: number; failure_pattern_fingerprint: string }>(
            'SELECT owner_id, identical_failure_count, failure_pattern_fingerprint FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        return reply.send({
            failed_tests: [], error_excerpts: [],
            failure_pattern_fingerprint: job.failure_pattern_fingerprint ?? '',
            identical_failure_count: job.identical_failure_count,
            last_patch_summary: null, partial_artifact_url: null,
            available_actions: [
                { type: 'DEEP_FIX', requires_confirmation: true },
                { type: 'INTERVENE' },
                { type: 'RETRY_STRONGER_MODEL' },
                { type: 'EDIT_SPEC' },
                { type: 'DOWNLOAD_PARTIAL' },
                { type: 'REPORT_ISSUE' },
            ],
        });
    });

    // POST /api/v1/jobs/:job_id/intervention/deep-fix
    app.post('/jobs/:job_id/intervention/deep-fix', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const tier = request.user!.tier;

        const { rows: [job] } = await db.query<{ owner_id: string; status: string }>(
            'SELECT owner_id, status FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        try {
            const client = await getTemporalClient();
            await client.workflow.getHandle(`job-${job_id}`).signal('interventionAction', {
                action: 'DEEP_FIX',
                tier,
            });
        } catch (err) {
            logger.error({ err }, 'Failed to signal deep fix');
        }

        await writeAuditEvent({ actorId: userId, jobId: job_id, eventType: 'intervention.deep_fix', surface: 'IDE' });
        return reply.send({ job_id, status: 'DEEP_FIX_ACTIVE', context_reset: true, model_upgraded: ['MAX', 'ENTERPRISE'].includes(tier), new_attempt_counter: 0 });
    });

    // POST /api/v1/jobs/:job_id/intervention/command
    app.post('/jobs/:job_id/intervention/command', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { command } = request.body as { command?: string };
        if (!command) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'command required.', details: {} } });

        const commandId = uuidv4();
        try {
            const client = await getTemporalClient();
            await client.workflow.getHandle(`job-${job_id}`).signal('interventionAction', { action: 'COMMAND', command, commandId });
        } catch { /* log */ }

        return reply.send({ command_id: commandId, status: 'USER_INTERVENING' });
    });

    // POST /api/v1/jobs/:job_id/intervention/run-tests
    app.post('/jobs/:job_id/intervention/run-tests', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;

        const { rows: [job] } = await db.query<{ owner_id: string }>(
            'SELECT owner_id FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        const testRunId = uuidv4();
        try {
            const client = await getTemporalClient();
            await client.workflow.getHandle(`job-${job_id}`).signal('interventionAction', { action: 'RUN_TESTS', testRunId });
        } catch { /* log */ }

        return reply.send({ test_run_id: testRunId, status: 'RUNNING' });
    });

    // GET /api/v1/jobs/:job_id/enterprise-report
    app.get('/jobs/:job_id/enterprise-report', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const tier = request.user!.tier;

        if (tier !== 'ENTERPRISE') {
            return reply.status(403).send({ error: { code: 'ENTITLEMENT_DENIED', message: 'Enterprise tier required.', details: { denial_reason: 'ENTERPRISE_TIER_REQUIRED' } } });
        }

        const { rows: [job] } = await db.query<{ owner_id: string; artifact_expires_at: string }>(
            'SELECT owner_id, artifact_expires_at FROM refactor_jobs WHERE id=$1', [job_id]
        );
        if (!job || job.owner_id !== userId) return reply.status(403).send({ error: { code: 'JOB_OWNERSHIP_VIOLATION', message: 'Access denied.', details: {} } });

        return reply.send({ pdf_url: null, json_url: null, generated_at: new Date().toISOString(), expires_at: job.artifact_expires_at });
    });
}
