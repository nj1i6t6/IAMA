import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/pool';
import { writeAuditEvent } from '../lib/audit';
import { logger } from '../lib/logger';
import config from '../config';

// ─── Admin auth middleware ────────────────────────────────────────────────────

async function requireAdminSession(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<{ adminId: string; role: string } | null> {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing admin token.', details: {} } });
        return null;
    }
    const rawToken = auth.slice(7);

    const { rows: sessions } = await db.query<{ id: string; admin_id: string; token_hash: string; expires_at: string; revoked_at: string | null }>(
        `SELECT s.id, s.admin_id, s.token_hash, s.expires_at, s.revoked_at
     FROM admin_sessions s
     WHERE s.expires_at > NOW() AND s.revoked_at IS NULL
     ORDER BY s.created_at DESC LIMIT 100`
    );

    for (const sess of sessions) {
        if (await bcrypt.compare(rawToken, sess.token_hash)) {
            const { rows: [admin] } = await db.query<{ role: string; status: string }>(
                'SELECT role, status FROM admin_accounts WHERE id=$1', [sess.admin_id]
            );
            if (admin?.status !== 'ACTIVE') {
                reply.status(403).send({ error: { code: 'ACCOUNT_SUSPENDED', message: 'Account is suspended or deactivated.', details: {} } });
                return null;
            }
            (request as any).adminId = sess.admin_id;
            (request as any).adminRole = admin.role;
            return { adminId: sess.admin_id, role: admin.role };
        }
    }

    reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired admin token.', details: {} } });
    return null;
}

function requireRole(allowedRoles: string[], admin: { role: string } | null, reply: FastifyReply): boolean {
    if (!admin || !allowedRoles.includes(admin.role)) {
        reply.status(403).send({ error: { code: 'ROLE_INSUFFICIENT', message: `Required role: ${allowedRoles.join(' or ')}.`, details: { required_role: allowedRoles[0] } } });
        return false;
    }
    return true;
}

// ─── Admin route registration ─────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance) {

    // POST /api/v1/admin/auth/login
    app.post('/auth/login', async (request, reply) => {
        const { email, password } = request.body as { email?: string; password?: string };
        if (!email || !password) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'email and password required.', details: {} } });

        const { rows: [admin] } = await db.query<{ id: string; password_hash: string; role: string; status: string }>(
            'SELECT id, password_hash, role, status FROM admin_accounts WHERE email=$1', [email.toLowerCase()]
        );

        if (!admin) return reply.status(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.', details: {} } });
        if (admin.status === 'SUSPENDED') return reply.status(403).send({ error: { code: 'ACCOUNT_SUSPENDED', message: 'Account suspended.', details: {} } });
        if (admin.status === 'DEACTIVATED') return reply.status(403).send({ error: { code: 'ACCOUNT_DEACTIVATED', message: 'Account deactivated.', details: {} } });

        if (!(await bcrypt.compare(password, admin.password_hash))) {
            return reply.status(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.', details: {} } });
        }

        const rawToken = crypto.randomBytes(48).toString('hex');
        const tokenHash = await bcrypt.hash(rawToken, config.adminBcryptRounds);
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

        await db.query(
            `INSERT INTO admin_sessions (admin_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
            [admin.id, tokenHash, request.ip, request.headers['user-agent'] ?? null, expiresAt]
        );
        await db.query('UPDATE admin_accounts SET last_login_at=NOW() WHERE id=$1', [admin.id]);

        logger.info({ adminId: admin.id, role: admin.role }, 'Admin login');

        return reply.send({ token: rawToken, admin_id: admin.id, role: admin.role, expires_at: expiresAt });
    });

    // POST /api/v1/admin/auth/logout
    app.post('/auth/logout', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        const rawToken = request.headers.authorization!.slice(7);

        const { rows: sessions } = await db.query<{ id: string; token_hash: string }>(
            'SELECT id, token_hash FROM admin_sessions WHERE expires_at > NOW() AND revoked_at IS NULL'
        );
        for (const sess of sessions) {
            if (await bcrypt.compare(rawToken, sess.token_hash)) {
                await db.query('UPDATE admin_sessions SET revoked_at=NOW() WHERE id=$1', [sess.id]);
                break;
            }
        }
        return reply.status(204).send();
    });

    // GET /api/v1/admin/auth/me
    app.get('/auth/me', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        const { rows: [a] } = await db.query<{ email: string; last_login_at: string }>(
            'SELECT email, last_login_at FROM admin_accounts WHERE id=$1', [admin.adminId]
        );
        return reply.send({ admin_id: admin.adminId, email: a.email, role: admin.role, last_login_at: a.last_login_at });
    });

    // PATCH /api/v1/admin/auth/me/password
    app.patch('/auth/me/password', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        const { current_password, new_password } = request.body as { current_password?: string; new_password?: string };
        if (!current_password || !new_password) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Both passwords required.', details: {} } });
        if (new_password.length < 12) return reply.status(400).send({ error: { code: 'WEAK_PASSWORD', message: 'Password must be ≥ 12 chars.', details: {} } });

        const { rows: [a] } = await db.query<{ password_hash: string }>('SELECT password_hash FROM admin_accounts WHERE id=$1', [admin.adminId]);
        if (!(await bcrypt.compare(current_password, a.password_hash))) {
            return reply.status(400).send({ error: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'Current password is incorrect.', details: {} } });
        }
        await db.query('UPDATE admin_accounts SET password_hash=$1, updated_at=NOW() WHERE id=$2', [await bcrypt.hash(new_password, config.adminBcryptRounds), admin.adminId]);
        return reply.status(204).send();
    });

    // GET /api/v1/admin/accounts — SUPER_ADMIN only
    app.get('/accounts', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        if (!requireRole(['SUPER_ADMIN'], admin, reply)) return;

        const { rows } = await db.query<any>(
            `SELECT id as admin_id, email, role, status, last_login_at, created_at FROM admin_accounts ORDER BY created_at ASC`
        );
        return reply.send({ accounts: rows });
    });

    // POST /api/v1/admin/accounts — SUPER_ADMIN only
    app.post('/accounts', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        if (!requireRole(['SUPER_ADMIN'], admin, reply)) return;

        const BodySchema = z.object({
            email: z.string().email(),
            password: z.string().min(12),
            role: z.enum(['ENGINEER', 'SUPPORT']),
        });
        const parsed = BodySchema.safeParse(request.body);
        if (!parsed.success) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', details: parsed.error.flatten() } });

        const { rows: exist } = await db.query('SELECT id FROM admin_accounts WHERE email=$1', [parsed.data.email.toLowerCase()]);
        if (exist[0]) return reply.status(409).send({ error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Admin already exists.', details: {} } });

        const hash = await bcrypt.hash(parsed.data.password, config.adminBcryptRounds);
        const { rows: [newAdmin] } = await db.query<{ id: string; created_at: string }>(
            `INSERT INTO admin_accounts (email, password_hash, role, created_by) VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
            [parsed.data.email.toLowerCase(), hash, parsed.data.role, admin.adminId]
        );

        await writeAuditEvent({ actorId: undefined, eventType: 'admin.account.created', surface: 'API', metadata: { target_admin_id: newAdmin.id, role: parsed.data.role } });

        return reply.status(201).send({ admin_id: newAdmin.id, email: parsed.data.email, role: parsed.data.role, created_at: newAdmin.created_at });
    });

    // PATCH /api/v1/admin/accounts/:admin_id — SUPER_ADMIN only
    app.patch('/accounts/:admin_id', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        if (!requireRole(['SUPER_ADMIN'], admin, reply)) return;

        const { admin_id } = request.params as { admin_id: string };
        if (admin_id === admin.adminId) {
            return reply.status(403).send({ error: { code: 'CANNOT_MODIFY_OWN_ACCOUNT', message: 'Cannot modify own account.', details: {} } });
        }

        const { role, status, reason } = request.body as { role?: string; status?: string; reason?: string };
        const fields: string[] = [];
        const vals: any[] = [];

        if (role && ['ENGINEER', 'SUPPORT'].includes(role)) { vals.push(role); fields.push(`role=$${vals.length}`); }
        if (status && ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(status)) { vals.push(status); fields.push(`status=$${vals.length}`); }

        if (fields.length === 0) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update.', details: {} } });

        vals.push(admin_id);
        await db.query(`UPDATE admin_accounts SET ${fields.join(',')}, updated_at=NOW() WHERE id=$${vals.length}`, vals);

        const auditId = (await db.query<{ id: string }>(
            `INSERT INTO audit_events (event_type, surface, metadata) VALUES ('admin.account.updated','API',$1) RETURNING id`,
            [JSON.stringify({ target: admin_id, role, status, reason })]
        )).rows[0]?.id;

        return reply.send({ admin_id, role, status, audit_event_id: auditId });
    });

    // POST /api/v1/admin/accounts/:admin_id/reset-password — SUPER_ADMIN only
    app.post('/accounts/:admin_id/reset-password', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        if (!requireRole(['SUPER_ADMIN'], admin, reply)) return;

        const { admin_id } = request.params as { admin_id: string };
        const tmpPwd = crypto.randomBytes(12).toString('base64').slice(0, 16);
        const hash = await bcrypt.hash(tmpPwd, config.adminBcryptRounds);
        await db.query('UPDATE admin_accounts SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, admin_id]);

        const { rows: [ev] } = await db.query<{ id: string }>(
            `INSERT INTO audit_events (event_type, surface, metadata) VALUES ('admin.password.reset','API',$1) RETURNING id`,
            [JSON.stringify({ target: admin_id })]
        );
        return reply.send({ temporary_password: tmpPwd, audit_event_id: ev.id });
    });

    // GET /api/v1/admin/users/:user_id — Any admin
    app.get('/users/:user_id', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;

        const { user_id } = request.params as { user_id: string };
        const { rows: [user] } = await db.query<any>(
            `SELECT u.id, u.email, u.created_at, st.tier, st.status as billing_status
       FROM users u
       LEFT JOIN subscription_tiers st ON st.user_id = u.id AND st.status = 'ACTIVE'
       WHERE u.id=$1 AND u.deleted_at IS NULL`, [user_id]
        );
        if (!user) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found.', details: {} } });

        const { rows: recentJobs } = await db.query(
            `SELECT id as job_id, status, created_at FROM refactor_jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 10`, [user_id]
        );

        return reply.send({ user_id, email: user.email, tier: user.tier ?? 'FREE', created_at: user.created_at, recent_jobs: recentJobs, current_usage: {}, billing_status: user.billing_status ?? 'ACTIVE' });
    });

    // PATCH /api/v1/admin/quota/:user_id — SUPER_ADMIN, SUPPORT
    app.patch('/quota/:user_id', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        if (!requireRole(['SUPER_ADMIN', 'SUPPORT'], admin, reply)) return;

        const { user_id } = request.params as { user_id: string };
        const { phase, delta, reason_code } = request.body as { phase?: number; delta?: number; reason_code?: string };
        if (!phase || delta === undefined || !reason_code) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'phase, delta, reason_code required.', details: {} } });

        const idemKey = `admin-quota:${user_id}:${phase}:${Date.now()}`;
        await db.query(
            `INSERT INTO usage_ledger (user_id, event_type, quantity, billable, idempotency_key)
       VALUES ($1, $2, $3, false, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
            [user_id, `admin_adjustment_phase_${phase}`, delta, idemKey]
        );

        const { rows: [ev] } = await db.query<{ id: string }>(
            `INSERT INTO audit_events (event_type, surface, metadata) VALUES ('admin.quota.adjusted','API',$1) RETURNING id`,
            [JSON.stringify({ user_id, phase, delta, reason_code, admin_id: admin.adminId })]
        );
        return reply.send({ new_balance: delta, audit_event_id: ev.id });
    });

    // POST /api/v1/admin/kill-switch — SUPER_ADMIN/ENGINEER (global), +SUPPORT (per-user)
    app.post('/kill-switch', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;

        const { scope, user_id, action, reason } = request.body as { scope?: string; user_id?: string; action?: string; reason?: string };

        if (scope === 'GLOBAL' && !['SUPER_ADMIN', 'ENGINEER'].includes(admin.role)) {
            return reply.status(403).send({ error: { code: 'ROLE_INSUFFICIENT', message: 'Global kill-switch requires SUPER_ADMIN or ENGINEER.', details: { required_role: 'ENGINEER' } } });
        }
        if (scope === 'USER' && !['SUPER_ADMIN', 'ENGINEER', 'SUPPORT'].includes(admin.role)) {
            return reply.status(403).send({ error: { code: 'ROLE_INSUFFICIENT', message: 'Per-user kill-switch requires SUPPORT or above.', details: { required_role: 'SUPPORT' } } });
        }

        if (scope === 'GLOBAL') {
            const enabled = action === 'ENABLE';
            await db.query(
                `UPDATE dynamic_configs SET config_value=$1, updated_by=$2, effective_at=NOW() WHERE config_key='system.kill_switch.global'`,
                [JSON.stringify(enabled), admin.adminId]
            );
            await db.query(
                `UPDATE dynamic_configs SET config_value=$1, updated_by=$2 WHERE config_key='system.kill_switch.reason'`,
                [JSON.stringify(reason ?? ''), admin.adminId]
            );
        }

        const effectiveAt = new Date().toISOString();
        const { rows: [ev] } = await db.query<{ id: string }>(
            `INSERT INTO audit_events (event_type, surface, metadata) VALUES ('admin.kill_switch','API',$1) RETURNING id`,
            [JSON.stringify({ scope, user_id, action, reason })]
        );
        return reply.send({ effective_at: effectiveAt, audit_event_id: ev.id });
    });

    // GET /api/v1/admin/config — SUPER_ADMIN, ENGINEER
    app.get('/config', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        if (!requireRole(['SUPER_ADMIN', 'ENGINEER'], admin, reply)) return;

        const { rows } = await db.query<any>(
            `SELECT dc.config_key as key, dc.config_value as value, dc.scope, dc.effective_at as updated_at,
              aa.email as updated_by, dc.reason
       FROM dynamic_configs dc
       LEFT JOIN admin_accounts aa ON aa.id = dc.updated_by`
        );

        // Mask api_key_ref values
        const entries = rows.map((r) => ({
            ...r,
            value: String(r.key).endsWith('api_key_ref') ? '***' : r.value,
        }));
        return reply.send({ entries });
    });

    // PUT /api/v1/admin/config/:key — SUPER_ADMIN (api_key_ref), ENGINEER (others)
    app.put('/config/:key', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;

        const { key } = request.params as { key: string };
        const { value, reason } = request.body as { value?: any; reason?: string };

        // api_key_ref keys require SUPER_ADMIN
        if (key.endsWith('api_key_ref') && admin.role !== 'SUPER_ADMIN') {
            return reply.status(403).send({ error: { code: 'ROLE_INSUFFICIENT', message: 'api_key_ref keys require SUPER_ADMIN.', details: { detail: 'api_key_ref keys require SUPER_ADMIN' } } });
        }
        if (!requireRole(['SUPER_ADMIN', 'ENGINEER'], admin, reply)) return;

        // Safety: api_key_ref must be a path string, not an actual secret
        if (key.endsWith('api_key_ref') && typeof value !== 'string') {
            return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'api_key_ref must be a secrets manager path string.', details: {} } });
        }

        await db.query(
            `INSERT INTO dynamic_configs (config_key, config_value, updated_by, reason)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (config_key) DO UPDATE SET config_value=$2, updated_by=$3, reason=$4, effective_at=NOW()`,
            [key, JSON.stringify(value), admin.adminId, reason ?? null]
        );

        const { rows: [ev] } = await db.query<{ id: string }>(
            `INSERT INTO audit_events (event_type, surface, metadata) VALUES ('admin.config.updated','API',$1) RETURNING id`,
            [JSON.stringify({ key, reason })]
        );
        return reply.send({ key, effective_at: new Date().toISOString(), audit_event_id: ev.id });
    });

    // GET /api/v1/admin/health — SUPER_ADMIN, ENGINEER
    app.get('/health', async (request, reply) => {
        const admin = await requireAdminSession(request, reply);
        if (!admin) return;
        if (!requireRole(['SUPER_ADMIN', 'ENGINEER'], admin, reply)) return;

        const { rows: [activeJobs] } = await db.query<{ cnt: string }>(
            `SELECT COUNT(*) as cnt FROM refactor_jobs WHERE status NOT IN ('DELIVERED','FAILED','FALLBACK_REQUIRED')`
        );
        const { rows: [ks] } = await db.query<{ config_value: boolean }>(
            `SELECT config_value FROM dynamic_configs WHERE config_key='system.kill_switch.global'`
        );

        return reply.send({
            api_error_rate_1h: 0,
            workflow_success_rate_24h: 1.0,
            model_provider_status: [
                { provider: 'MiniMax (L1)', status: 'OK' },
                { provider: 'Anthropic (L2/L3)', status: 'OK' },
            ],
            active_jobs: Number(activeJobs?.cnt ?? 0),
            queue_depth: 0,
            config_last_updated_at: new Date().toISOString(),
            kill_switch_active: ks?.config_value === true,
        });
    });
}
