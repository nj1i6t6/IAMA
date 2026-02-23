import { FastifyInstance } from 'fastify';
import { db } from '../db/pool';

export async function billingRoutes(app: FastifyInstance) {

    // GET /api/v1/billing/plan — V1-FR-PAY-005
    app.get('/billing/plan', async (request, reply) => {
        const userId = request.user!.user_id;
        const { rows: [sub] } = await db.query<any>(
            `SELECT tier, billing_cycle_start, billing_cycle_end,
              external_customer_id, payment_gateway
       FROM subscription_tiers WHERE user_id=$1 AND status='ACTIVE'
       ORDER BY created_at DESC LIMIT 1`, [userId]
        );

        return reply.send({
            current_tier: sub?.tier ?? 'FREE',
            billing_cycle_start: sub?.billing_cycle_start,
            billing_cycle_end: sub?.billing_cycle_end,
            next_billing_date: sub?.billing_cycle_end,
            upgrade_options: [
                { tier: 'PLUS', price_monthly: 29 },
                { tier: 'PRO', price_monthly: 79 },
                { tier: 'MAX', price_monthly: 199 },
                { tier: 'ENTERPRISE', price_monthly: null },
            ],
            portal_url: sub?.external_customer_id
                ? `https://billing.stripe.com/p/login/auto`
                : null,
        });
    });

    // POST /api/v1/billing/checkout — V1-FR-PAY-001
    app.post('/billing/checkout', async (request, reply) => {
        const { target_tier } = request.body as { target_tier?: string };
        if (!target_tier) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'target_tier required.', details: {} } });

        // In production this would create a Stripe Checkout Session
        return reply.send({ checkout_url: `https://billing.stripe.com/checkout?tier=${target_tier}` });
    });

    // GET /api/v1/billing/usage-report — V1-FR-PAY-004
    app.get('/billing/usage-report', async (request, reply) => {
        const userId = request.user!.user_id;
        const { rows: [sub] } = await db.query<{ billing_cycle_start: string; billing_cycle_end: string }>(
            `SELECT billing_cycle_start, billing_cycle_end FROM subscription_tiers
       WHERE user_id=$1 AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`, [userId]
        );

        return reply.send({
            period_start: sub?.billing_cycle_start,
            period_end: sub?.billing_cycle_end,
            phase_2_overage: 0,
            phase_3_overage: 0,
            sandbox_seconds_overage: 0,
            estimated_overage_cost: 0,
        });
    });
}
