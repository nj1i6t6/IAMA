import { db } from '../db/pool';

interface AuditEventInput {
    actorId?: string | null;
    jobId?: string | null;
    eventType: string;
    oldState?: string;
    newState?: string;
    surface?: 'IDE' | 'WEB' | 'API' | 'SYSTEM';
    metadata?: Record<string, unknown>;
    ipAddress?: string;
}

/**
 * Writes an audit_events row for every state-changing operation.
 * Required per AGENT_DEVELOPMENT_GUIDE.md Section 6.2 Rule 6:
 * "All state-changing operations on refactor_jobs, spec_revisions, patch_attempts
 *  must produce a row in audit_events. Never skip audit logging for performance."
 */
export async function writeAuditEvent(event: AuditEventInput): Promise<void> {
    await db.query(
        `INSERT INTO audit_events
       (actor_id, job_id, event_type, old_state, new_state, surface, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet)`,
        [
            event.actorId ?? null,
            event.jobId ?? null,
            event.eventType,
            event.oldState ?? null,
            event.newState ?? null,
            event.surface ?? 'API',
            JSON.stringify(event.metadata ?? {}),
            event.ipAddress ?? null,
        ]
    );
}
