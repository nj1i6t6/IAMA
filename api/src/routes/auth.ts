import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/pool';
import { signAccessToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { writeAuditEvent } from '../lib/audit';
import config from '../config';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
    email: z.string().email({ message: 'INVALID_EMAIL' }),
    password: z.string().min(8, { message: 'WEAK_PASSWORD' }),
});

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

const RefreshSchema = z.object({
    refresh_token: z.string(),
});

const LogoutSchema = z.object({
    refresh_token: z.string(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateAndStoreRefreshToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(48).toString('hex'); // 96 hex chars
    const tokenHash = await bcrypt.hash(rawToken, config.adminBcryptRounds);

    await db.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
        [userId, tokenHash]
    );

    return rawToken;
}

async function getUserTier(userId: string): Promise<{ tier: string; org_id: string | null }> {
    const { rows } = await db.query<{ tier: string }>(
        `SELECT tier FROM subscription_tiers WHERE user_id = $1 AND status = 'ACTIVE'
     ORDER BY created_at DESC LIMIT 1`,
        [userId]
    );
    return { tier: rows[0]?.tier ?? 'FREE', org_id: null };
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {

    // POST /api/v1/auth/register
    app.post('/register', async (request, reply) => {
        const parsed = RegisterSchema.safeParse(request.body);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            return reply.status(400).send({
                error: { code: issue.message, message: issue.message, details: {} },
            });
        }
        const { email, password } = parsed.data;

        const { rows: existing } = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        if (existing.length > 0) {
            return reply.status(400).send({
                error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email is already registered.', details: {} },
            });
        }

        const passwordHash = await bcrypt.hash(password, config.adminBcryptRounds);

        const { rows: [user] } = await db.query<{ id: string; email: string; created_at: string }>(
            `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
            [email.toLowerCase(), passwordHash]
        );

        // Provision FREE tier record
        await db.query(
            `INSERT INTO subscription_tiers
         (user_id, tier, status, context_cap, operating_mode, billing_cycle_start, billing_cycle_end)
       VALUES ($1, 'FREE', 'ACTIVE', 128000, 'SIMPLE', date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')`,
            [user.id]
        );

        logger.info({ userId: user.id }, 'User registered');
        return reply.status(201).send({
            user_id: user.id,
            email: user.email,
            created_at: user.created_at,
        });
    });

    // POST /api/v1/auth/login
    app.post('/login', async (request, reply) => {
        const parsed = LoginSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'Invalid request body.', details: {} },
            });
        }
        const { email, password } = parsed.data;

        const { rows } = await db.query<{ id: string; password_hash: string | null; deleted_at: string | null }>(
            'SELECT id, password_hash, deleted_at FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        const user = rows[0];
        if (!user || user.deleted_at || !user.password_hash) {
            return reply.status(401).send({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.', details: {} },
            });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return reply.status(401).send({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.', details: {} },
            });
        }

        const { tier, org_id } = await getUserTier(user.id);
        const accessToken = await signAccessToken({ user_id: user.id, tier, org_id });
        const refreshToken = await generateAndStoreRefreshToken(user.id);

        await writeAuditEvent({
            actorId: user.id,
            eventType: 'auth.login',
            surface: 'API',
            metadata: { method: 'password' },
        });

        logger.info({ userId: user.id }, 'User logged in');
        return reply.send({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: config.jwt.accessTokenTtl,
        });
    });

    // POST /api/v1/auth/refresh
    app.post('/refresh', async (request, reply) => {
        const parsed = RefreshSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'refresh_token required.', details: {} },
            });
        }
        const { refresh_token: rawToken } = parsed.data;

        // Find matching token (bcrypt comparison required)
        // We use a short window: tokens expire within 30 days
        const { rows: tokens } = await db.query<{
            id: string;
            user_id: string;
            token_hash: string;
            expires_at: string;
            revoked_at: string | null;
        }>(
            `SELECT id, user_id, token_hash, expires_at, revoked_at
       FROM refresh_tokens
       WHERE expires_at > NOW() AND revoked_at IS NULL
       ORDER BY created_at DESC
       LIMIT 200`
        );

        let matchedToken: typeof tokens[0] | null = null;
        for (const tok of tokens) {
            if (await bcrypt.compare(rawToken, tok.token_hash)) {
                matchedToken = tok;
                break;
            }
        }

        if (!matchedToken) {
            return reply.status(401).send({
                error: { code: 'REFRESH_TOKEN_INVALID', message: 'Token is invalid or expired.', details: {} },
            });
        }

        const { tier, org_id } = await getUserTier(matchedToken.user_id);
        const accessToken = await signAccessToken({ user_id: matchedToken.user_id, tier, org_id });

        return reply.send({
            access_token: accessToken,
            expires_in: config.jwt.accessTokenTtl,
        });
    });

    // POST /api/v1/auth/logout
    app.post('/logout', async (request, reply) => {
        const parsed = LogoutSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'refresh_token required.', details: {} },
            });
        }
        const { refresh_token: rawToken } = parsed.data;

        // Find and revoke the matching token
        const { rows: tokens } = await db.query<{ id: string; token_hash: string }>(
            `SELECT id, token_hash FROM refresh_tokens
       WHERE expires_at > NOW() AND revoked_at IS NULL`
        );

        for (const tok of tokens) {
            if (await bcrypt.compare(rawToken, tok.token_hash)) {
                await db.query(
                    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
                    [tok.id]
                );
                break;
            }
        }

        // Always 204 — don't reveal whether the token was found
        return reply.status(204).send();
    });

    // GET /api/v1/auth/oauth/github/initiate
    app.get('/oauth/github/initiate', async (request, reply) => {
        const state = crypto.randomBytes(16).toString('hex');
        const query = request.query as { redirect_uri?: string };
        const redirectUri = query.redirect_uri ?? `${config.apiBaseUrl}/api/v1/auth/oauth/callback`;

        const url = new URL('https://github.com/login/oauth/authorize');
        url.searchParams.set('client_id', config.oauth.github.clientId);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('scope', 'user:email');
        url.searchParams.set('state', `github:${state}`);

        return reply.send({
            authorization_url: url.toString(),
            state_token: `github:${state}`,
        });
    });

    // GET /api/v1/auth/oauth/google/initiate
    app.get('/oauth/google/initiate', async (request, reply) => {
        const state = crypto.randomBytes(16).toString('hex');
        const query = request.query as { redirect_uri?: string };
        const redirectUri = query.redirect_uri ?? `${config.apiBaseUrl}/api/v1/auth/oauth/callback`;

        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.searchParams.set('client_id', config.oauth.google.clientId);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', 'openid email');
        url.searchParams.set('state', `google:${state}`);
        url.searchParams.set('access_type', 'offline');

        return reply.send({
            authorization_url: url.toString(),
            state_token: `google:${state}`,
        });
    });

    // GET /api/v1/auth/oauth/callback
    app.get('/oauth/callback', async (request, reply) => {
        const query = request.query as { code?: string; state?: string; error?: string };

        if (query.error || !query.code || !query.state) {
            return reply.status(400).send({
                error: { code: 'OAUTH_ERROR', message: query.error ?? 'OAuth callback failed.', details: {} },
            });
        }

        const provider = query.state.startsWith('github:') ? 'GITHUB' : 'GOOGLE';

        try {
            const providerData = provider === 'GITHUB'
                ? await exchangeGitHubCode(query.code)
                : await exchangeGoogleCode(query.code);

            const userId = await findOrCreateOAuthUser(provider, providerData);
            const { tier, org_id } = await getUserTier(userId);
            const accessToken = await signAccessToken({ user_id: userId, tier, org_id });

            // Deep-link redirect for VS Code extension
            return reply.redirect(
                302,
                `vscode://iama.extension/auth?token=${encodeURIComponent(accessToken)}`
            );
        } catch (err) {
            logger.error({ err }, 'OAuth callback error');
            return reply.status(500).send({
                error: { code: 'INTERNAL_ERROR', message: 'OAuth processing failed.', details: {} },
            });
        }
    });
}

// ─── OAuth provider exchange helpers ────────────────────────────────────────

interface ProviderData {
    providerAccountId: string;
    providerLogin: string;
    providerEmail: string | null;
    emailVerified: boolean;
}

async function exchangeGitHubCode(code: string): Promise<ProviderData> {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: config.oauth.github.clientId,
            client_secret: config.oauth.github.clientSecret,
            code,
        }),
    });
    const { access_token } = await tokenRes.json() as any;

    const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
    });
    const ghUser = await userRes.json() as any;

    const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
    });
    const emails = await emailsRes.json() as Array<{ email: string; verified: boolean; primary: boolean }>;
    const primary = emails.find((e) => e.primary && e.verified) ?? null;

    return {
        providerAccountId: String(ghUser.id),
        providerLogin: ghUser.login,
        providerEmail: primary?.email ?? null,
        emailVerified: !!primary,
    };
}

async function exchangeGoogleCode(code: string): Promise<ProviderData> {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: config.oauth.google.clientId,
            client_secret: config.oauth.google.clientSecret,
            redirect_uri: `${config.apiBaseUrl}/api/v1/auth/oauth/callback`,
            grant_type: 'authorization_code',
        }),
    });
    const { access_token } = await tokenRes.json() as any;

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json() as any;

    return {
        providerAccountId: profile.id,
        providerLogin: profile.email,
        providerEmail: profile.email,
        emailVerified: !!profile.verified_email,
    };
}

/**
 * Implements the OAuth email-merge policy (API_CONTRACT.md Section 2):
 * - Existing oauth_accounts row → return linked user
 * - Verified email matches users.email → auto-merge (create oauth_accounts row)
 * - Unverified/absent email → create new separate user
 */
async function findOrCreateOAuthUser(
    provider: 'GITHUB' | 'GOOGLE',
    data: ProviderData
): Promise<string> {
    // 1. Check for existing oauth_accounts row
    const { rows: existing } = await db.query<{ user_id: string }>(
        'SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_account_id = $2',
        [provider, data.providerAccountId]
    );
    if (existing.length > 0) return existing[0].user_id;

    // 2. Auto-merge if provider email is verified and matches an existing user
    if (data.emailVerified && data.providerEmail) {
        const { rows: users } = await db.query<{ id: string }>(
            'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
            [data.providerEmail.toLowerCase()]
        );
        if (users.length > 0) {
            const userId = users[0].id;
            await db.query(
                `INSERT INTO oauth_accounts (user_id, provider, provider_account_id, provider_login, provider_email, scopes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, provider, data.providerAccountId, data.providerLogin, data.providerEmail, []]
            );
            return userId;
        }
    }

    // 3. Create new user
    const { rows: [newUser] } = await db.query<{ id: string }>(
        `INSERT INTO users (email) VALUES ($1) RETURNING id`,
        [data.providerEmail?.toLowerCase() ?? `${provider.toLowerCase()}_${data.providerAccountId}@noemail.iama.dev`]
    );

    await db.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_account_id, provider_login, provider_email, scopes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
        [newUser.id, provider, data.providerAccountId, data.providerLogin, data.providerEmail, []]
    );

    // Provision FREE tier
    await db.query(
        `INSERT INTO subscription_tiers
       (user_id, tier, status, context_cap, operating_mode, billing_cycle_start, billing_cycle_end)
     VALUES ($1, 'FREE', 'ACTIVE', 128000, 'SIMPLE', date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')`,
        [newUser.id]
    );

    return newUser.id;
}
