import { FastifyInstance } from 'fastify';
import { db } from '../db/pool';
import { logger } from '../lib/logger';
import config from '../config';

export async function webhookRoutes(app: FastifyInstance) {

    // POST /api/v1/webhooks/payment — V1-FR-PAY-002 (Stripe)
    // Must be idempotent: check last_webhook_event_id before processing
    app.post('/webhooks/payment', {
        config: { rawBody: true }, // Stripe signature verification requires raw body
    }, async (request, reply) => {
        // Verify Stripe signature
        const sig = request.headers['stripe-signature'] as string;
        let event: any;

        try {
            // Dynamic import to avoid top-level Stripe import breaking tests without key
            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(config.stripe.secretKey);
            event = stripe.webhooks.constructEvent(
                (request as any).rawBody ?? JSON.stringify(request.body),
                sig,
                config.stripe.webhookSecret
            );
        } catch (err) {
            logger.warn({ err }, 'Stripe webhook signature verification failed');
            return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid signature.', details: {} } });
        }

        const subscriptionId = event.data?.object?.id ?? event.data?.object?.subscription;

        // Idempotency check — last_webhook_event_id
        const { rows: [existing] } = await db.query<{ last_webhook_event_id: string }>(
            'SELECT last_webhook_event_id FROM payment_subscriptions WHERE external_subscription_id=$1',
            [subscriptionId]
        );
        if (existing?.last_webhook_event_id === event.id) {
            return reply.send({ received: true, duplicate: true });
        }

        try {
            await processStripeEvent(event);
        } catch (err) {
            logger.error({ err, eventId: event.id }, 'Stripe webhook processing error');
            return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Processing failed.', details: {} } });
        }

        return reply.send({ received: true });
    });
}

async function processStripeEvent(event: any) {
    const obj = event.data?.object;
    const type = event.type;

    if (['customer.subscription.updated', 'customer.subscription.deleted',
        'invoice.payment_succeeded', 'invoice.payment_failed'].includes(type)) {

        const customerId = obj.customer;
        const subscriptionId = obj.id ?? obj.subscription;

        // Map Stripe tier from metadata or price
        const stripeTier = obj.metadata?.iama_tier ?? 'PLUS';
        const stripeStatus = mapStripeStatus(obj.status ?? type);

        // Update payment_subscriptions mirror
        await db.query(
            `INSERT INTO payment_subscriptions
         (user_id, gateway, external_subscription_id, external_customer_id, tier, status, last_webhook_event_id)
       SELECT u.id, 'stripe', $1, $2, $3, $4, $5
       FROM users u
       JOIN subscription_tiers st ON st.user_id = u.id AND st.external_customer_id = $2
       LIMIT 1
       ON CONFLICT (external_subscription_id) DO UPDATE
         SET status=$4, tier=$3, last_webhook_event_id=$5, updated_at=NOW()`,
            [subscriptionId, customerId, stripeTier, stripeStatus, event.id]
        );

        // Sync to subscription_tiers (authoritative source)
        if (stripeStatus === 'ACTIVE') {
            await db.query(
                `UPDATE subscription_tiers
         SET tier=$1, status='ACTIVE', updated_at=NOW()
         WHERE external_customer_id=$2`,
                [stripeTier, customerId]
            );
        } else if (['CANCELLED', 'PAST_DUE'].includes(stripeStatus)) {
            await db.query(
                `UPDATE subscription_tiers SET tier='FREE', status=$1, updated_at=NOW()
         WHERE external_customer_id=$2`,
                [stripeStatus, customerId]
            );
        }
    }
}

function mapStripeStatus(s: string): string {
    if (s === 'active') return 'ACTIVE';
    if (s === 'past_due') return 'PAST_DUE';
    if (s === 'canceled' || s === 'customer.subscription.deleted') return 'CANCELLED';
    if (s === 'invoice.payment_succeeded') return 'ACTIVE';
    if (s === 'invoice.payment_failed') return 'PAST_DUE';
    return 'ACTIVE';
}
