import { Pool } from 'pg';
import config from '../config';
import { logger } from '../lib/logger';

export const db = new Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});

db.on('error', (err) => {
    logger.error({ err }, 'Unexpected PgBouncer/PostgreSQL pool error');
});

/**
 * Executes a callback within a serialisable transaction with an advisory lock.
 * Used for quota reservation to prevent double-spend (V1-FR-BIL race condition).
 *
 * pg_advisory_xact_lock is released automatically when the transaction ends.
 */
export async function withAdvisoryLock<T>(
    lockKey: string,
    fn: (client: Pool['prototype'] extends null ? never : InstanceType<typeof import('pg').PoolClient>) => Promise<T>
): Promise<T> {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        // Hash the key to an integer for pg_advisory_xact_lock
        await client.query(
            `SELECT pg_advisory_xact_lock(hashtext($1))`,
            [lockKey]
        );
        const result = await fn(client as any);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
