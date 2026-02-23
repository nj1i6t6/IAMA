import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url(),
    TEMPORAL_ADDRESS: z.string().default('temporal:7233'),
    TEMPORAL_NAMESPACE: z.string().default('default'),
    TEMPORAL_TASK_QUEUE: z.string().default('iama-main-queue'),
    JWT_PRIVATE_KEY_PATH: z.string().default('/run/secrets/jwt_private_key'),
    JWT_PUBLIC_KEY_PATH: z.string().default('/run/secrets/jwt_public_key'),
    STRIPE_WEBHOOK_SECRET: z.string().default(''),
    STRIPE_SECRET_KEY: z.string().default(''),
    GITHUB_CLIENT_ID: z.string().default(''),
    GITHUB_CLIENT_SECRET: z.string().default(''),
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    API_BASE_URL: z.string().url().default('http://localhost:3000'),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3001'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    ARTIFACT_TTL_DAYS: z.coerce.number().default(14),
    ADMIN_BCRYPT_ROUNDS: z.coerce.number().default(12),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.format());
    process.exit(1);
}

const env = parsed.data;

const config = {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    temporal: {
        address: env.TEMPORAL_ADDRESS,
        namespace: env.TEMPORAL_NAMESPACE,
        taskQueue: env.TEMPORAL_TASK_QUEUE,
    },
    jwt: {
        privateKeyPath: env.JWT_PRIVATE_KEY_PATH,
        publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
        accessTokenTtl: 15 * 60,          // 15 minutes in seconds
        refreshTokenTtl: 30 * 24 * 60 * 60, // 30 days in seconds
    },
    stripe: {
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        secretKey: env.STRIPE_SECRET_KEY,
    },
    oauth: {
        github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
        },
        google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
    },
    apiBaseUrl: env.API_BASE_URL,
    allowedOrigins: env.ALLOWED_ORIGINS.split(','),
    logLevel: env.LOG_LEVEL,
    artifactTtlDays: env.ARTIFACT_TTL_DAYS,
    adminBcryptRounds: env.ADMIN_BCRYPT_ROUNDS,
} as const;

export default config;
