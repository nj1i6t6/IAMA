import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/pool';

let killSwitchCache: { active: boolean; reason: string; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10_000; // Re-check every 10s

export async function killSwitchGuard(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const url = request.url.split('?')[0];

    // Health checks and webhook handlers are always allowed
    if (url === '/health' || url.startsWith('/api/v1/webhooks')) {
        return;
    }

    const now = Date.now();

    if (!killSwitchCache || now - killSwitchCache.fetchedAt > CACHE_TTL_MS) {
        try {
            const { rows } = await db.query<{ config_value: boolean | string }>(
                `SELECT config_value FROM dynamic_configs WHERE config_key = 'system.kill_switch.global'`
            );
            const reasonRow = await db.query<{ config_value: string }>(
                `SELECT config_value FROM dynamic_configs WHERE config_key = 'system.kill_switch.reason'`
            );

            killSwitchCache = {
                active: rows[0]?.config_value === true || rows[0]?.config_value === 'true',
                reason: (reasonRow.rows[0]?.config_value as string) || 'System maintenance',
                fetchedAt: now,
            };
        } catch {
            // If we can't read the flag, don't block the request
            return;
        }
    }

    if (killSwitchCache.active) {
        return reply.status(503).send({
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: `Service is temporarily unavailable: ${killSwitchCache.reason}`,
                details: {},
            },
        });
    }
}
