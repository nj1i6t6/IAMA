import { FastifyInstance } from 'fastify';
import { db } from '../db/pool';

export async function subscriptionRoutes(app: FastifyInstance) {

    // GET /api/v1/subscription/me — V1-FR-SUB-001
    app.get('/subscription/me', async (request, reply) => {
        const userId = request.user!.user_id;
        const { rows } = await db.query<{
            tier: string; status: string; context_cap: number;
            operating_mode: string; billing_cycle_start: string; billing_cycle_end: string;
        }>(
            `SELECT tier, status, context_cap, operating_mode, billing_cycle_start, billing_cycle_end
       FROM subscription_tiers WHERE user_id = $1 AND status IN ('ACTIVE','TRIAL','PAST_DUE')
       ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );
        if (!rows[0]) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No subscription.', details: {} } });
        const sub = rows[0];
        const lim = getTierLimits(sub.tier);
        return reply.send({
            tier: sub.tier, context_cap: sub.context_cap, operating_mode: sub.operating_mode,
            phase_1_limit: lim.phase1, phase_2_limit: lim.phase2, phase_3_limit: lim.phase3,
            execution_environments: lim.executionEnvs, web_github_enabled: lim.webGithubEnabled,
            enterprise_report_enabled: sub.tier === 'ENTERPRISE',
            billing_status: sub.status === 'ACTIVE' ? 'ACTIVE' : sub.status,
        });
    });

    // GET /api/v1/usage/summary — V1-FR-SUB-003
    app.get('/usage/summary', async (request, reply) => {
        const userId = request.user!.user_id;
        const { rows: [sub] } = await db.query<{ billing_cycle_start: string; billing_cycle_end: string; tier: string }>(
            `SELECT billing_cycle_start, billing_cycle_end, tier FROM subscription_tiers
       WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`, [userId]
        );
        const { rows: usageRows } = await db.query<{ event_type: string; quantity: string }>(
            `SELECT event_type, SUM(quantity) as quantity FROM usage_ledger
       WHERE user_id = $1 AND recorded_at >= $2 AND recorded_at < $3 AND billable = true
       GROUP BY event_type`,
            [userId, sub?.billing_cycle_start, sub?.billing_cycle_end]
        );
        const used = { phase1: 0, phase2: 0, phase3: 0 };
        for (const r of usageRows) {
            if (r.event_type === 'phase_1_call') used.phase1 += Number(r.quantity);
            if (r.event_type === 'phase_2_call') used.phase2 += Number(r.quantity);
            if (r.event_type === 'phase_3_call') used.phase3 += Number(r.quantity);
        }
        const lim = getTierLimits(sub?.tier ?? 'FREE');
        return reply.send({
            cycle_start: sub?.billing_cycle_start, cycle_end: sub?.billing_cycle_end,
            phase_1: { used: used.phase1, limit: lim.phase1.limit, reset_type: lim.phase1.type },
            phase_2: { used: used.phase2, limit: lim.phase2.limit },
            phase_3: { used: used.phase3, limit: lim.phase3.limit },
            last_updated: new Date().toISOString(),
        });
    });

    // GET /api/v1/usage/job/:job_id — V1-FR-SUB-002
    app.get('/usage/job/:job_id', async (request, reply) => {
        const { job_id } = request.params as { job_id: string };
        const userId = request.user!.user_id;
        const { rows: jobs } = await db.query('SELECT id FROM refactor_jobs WHERE id=$1 AND owner_id=$2', [job_id, userId]);
        if (!jobs[0]) return reply.status(403).send({ error: { code: 'JOB_NOT_OWNED', message: 'Access denied.', details: {} } });
        const { rows } = await db.query<{ event_type: string; quantity: string; billable: boolean; failure_class: string | null }>(
            `SELECT event_type, SUM(quantity) as quantity, BOOL_OR(billable) as billable, MAX(failure_class) as failure_class
       FROM usage_ledger WHERE job_id=$1 GROUP BY event_type`, [job_id]
        );
        const u = { phase_1_calls: 0, phase_2_calls: 0, phase_3_calls: 0, sandbox_seconds: 0, billable: true, failure_class: null as string | null };
        for (const r of rows) {
            if (r.event_type === 'phase_1_call') u.phase_1_calls += Number(r.quantity);
            if (r.event_type === 'phase_2_call') u.phase_2_calls += Number(r.quantity);
            if (r.event_type === 'phase_3_call') u.phase_3_calls += Number(r.quantity);
            if (r.event_type === 'sandbox_second') u.sandbox_seconds += Number(r.quantity);
            if (!r.billable) u.billable = false;
            if (r.failure_class) u.failure_class = r.failure_class;
        }
        return reply.send({ job_id, ...u, prompt_tokens: 0, completion_tokens: 0 });
    });
}

function getTierLimits(tier: string) {
    const M: Record<string, any> = {
        FREE: { phase1: { type: 'daily', limit: 3 }, phase2: { limit: null }, phase3: { limit: null }, executionEnvs: ['LOCAL'], webGithubEnabled: false },
        PLUS: { phase1: { type: 'daily', limit: 8 }, phase2: { limit: 280 }, phase3: { limit: null }, executionEnvs: ['LOCAL'], webGithubEnabled: false },
        PRO: { phase1: { type: 'daily', limit: 20 }, phase2: { limit: 650 }, phase3: { limit: null }, executionEnvs: ['LOCAL'], webGithubEnabled: false },
        MAX: { phase1: { type: 'daily', limit: 40 }, phase2: { limit: 1500 }, phase3: { limit: 1500 }, executionEnvs: ['LOCAL'], webGithubEnabled: false },
        ENTERPRISE: { phase1: { type: 'monthly', limit: null }, phase2: { limit: null }, phase3: { limit: null }, executionEnvs: ['LOCAL', 'CLOUD'], webGithubEnabled: true },
    };
    return M[tier] ?? M['FREE'];
}
