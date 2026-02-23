import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../lib/jwt';
import { db } from '../db/pool';

// Routes that bypass JWT auth
const PUBLIC_PATHS = new Set([
    '/health',
    '/api/v1/auth/register',
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/auth/oauth/github/initiate',
    '/api/v1/auth/oauth/google/initiate',
    '/api/v1/auth/oauth/callback',
    '/api/v1/webhooks/payment',
]);

// Admin routes use their own auth system
const ADMIN_AUTH_BYPASS = /^\/api\/v1\/admin\/auth\//;

declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            user_id: string;
            tier: string;
            org_id: string | null;
        };
    }
}

export async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const url = request.url.split('?')[0];

    if (PUBLIC_PATHS.has(url) || ADMIN_AUTH_BYPASS.test(url)) {
        return;
    }

    // Admin routes (except /auth/) bypass user JWT — handled by adminAuthMiddleware
    if (url.startsWith('/api/v1/admin/')) {
        return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Missing or invalid Authorization header.',
                details: {},
            },
        });
    }

    const token = authHeader.slice(7);

    try {
        const payload = await verifyAccessToken(token);

        // Verify user still exists and is not soft-deleted
        const { rows } = await db.query<{ id: string }>(
            'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL',
            [payload.user_id]
        );
        if (rows.length === 0) {
            return reply.status(401).send({
                error: { code: 'UNAUTHORIZED', message: 'User not found.', details: {} },
            });
        }

        request.user = payload;
    } catch (err: any) {
        const code = err?.code === 'ERR_JWT_EXPIRED' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
        return reply.status(401).send({
            error: { code, message: 'Invalid or expired token.', details: {} },
        });
    }
}
