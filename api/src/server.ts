import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { db } from './db/pool';
import { logger } from './lib/logger';
import { authRoutes } from './routes/auth';
import { subscriptionRoutes } from './routes/subscription';
import { jobRoutes } from './routes/jobs';
import { billingRoutes } from './routes/billing';
import { adminRoutes } from './routes/admin';
import { supportRoutes } from './routes/support';
import { telemetryRoutes } from './routes/telemetry';
import { webhookRoutes } from './routes/webhooks';
import { healthRoutes } from './routes/health';
import { killSwitchGuard } from './middleware/killSwitchGuard';
import { authMiddleware } from './middleware/auth';
import config from './config';

const app = Fastify({
    logger: {
        level: config.logLevel,
        serializers: {
            req(request) {
                return {
                    method: request.method,
                    url: request.url,
                    hostname: request.hostname,
                };
            },
            res(reply) {
                return { statusCode: reply.statusCode };
            },
        },
    },
    trustProxy: true,
});

async function buildApp() {
    // ─── Security Plugins ──────────────────────────────────────────────────────
    await app.register(helmet, {
        contentSecurityPolicy: false, // Managed at API Gateway level
    });
    await app.register(cors, {
        origin: config.allowedOrigins,
        credentials: true,
    });
    await app.register(rateLimit, {
        max: 200,
        timeWindow: '1 minute',
        keyGenerator: (req) => req.ip,
        errorResponseBuilder: () => ({
            error: {
                code: 'RATE_LIMITED',
                message: 'Too many requests. Please slow down.',
                details: {},
            },
        }),
    });

    // ─── Health check (no auth) ───────────────────────────────────────────────
    await app.register(healthRoutes);

    // ─── Webhook routes (raw body, no auth middleware) ─────────────────────────
    await app.register(webhookRoutes, { prefix: '/api/v1' });

    // ─── Auth routes (no JWT middleware) ──────────────────────────────────────
    await app.register(authRoutes, { prefix: '/api/v1/auth' });

    // ─── Kill-switch guard (applies before all authenticated routes) ──────────
    app.addHook('preHandler', killSwitchGuard);

    // ─── JWT auth middleware for protected routes ──────────────────────────────
    app.addHook('preHandler', authMiddleware);

    // ─── Protected routes ──────────────────────────────────────────────────────
    await app.register(subscriptionRoutes, { prefix: '/api/v1' });
    await app.register(jobRoutes, { prefix: '/api/v1' });
    await app.register(billingRoutes, { prefix: '/api/v1' });
    await app.register(supportRoutes, { prefix: '/api/v1' });
    await app.register(telemetryRoutes, { prefix: '/api/v1' });

    // ─── Admin routes (separate auth) ─────────────────────────────────────────
    await app.register(adminRoutes, { prefix: '/api/v1/admin' });

    // ─── Global error handler ──────────────────────────────────────────────────
    app.setErrorHandler((error, _request, reply) => {
        logger.error({ err: error }, 'Unhandled error');

        if (reply.statusCode === 200) {
            reply.statusCode = 500;
        }
        reply.send({
            error: {
                code: (error as any).code || 'INTERNAL_ERROR',
                message: error.message || 'An internal error occurred.',
                details: (error as any).details || {},
            },
        });
    });

    return app;
}

async function start() {
    try {
        // Verify DB connection on startup
        await db.query('SELECT 1');
        logger.info('Database connection verified');

        const fastify = await buildApp();
        await fastify.listen({ port: config.port, host: '0.0.0.0' });
        logger.info({ port: config.port }, 'IAMA API listening');
    } catch (err) {
        logger.error({ err }, 'Failed to start server');
        process.exit(1);
    }
}

start();

export { buildApp };
