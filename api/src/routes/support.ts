import { FastifyInstance } from 'fastify';
import { db } from '../db/pool';

export async function supportRoutes(app: FastifyInstance) {

    // POST /api/v1/support/tickets — V1-FR-SUP-002
    app.post('/support/tickets', async (request, reply) => {
        const userId = request.user!.user_id;
        const body = request.body as {
            job_id?: string;
            issue_type?: string;
            description?: string;
            consent_to_share_logs?: boolean;
        };

        if (!body.issue_type) {
            return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'issue_type required.', details: {} } });
        }

        // Validate job ownership if job_id provided
        if (body.job_id) {
            const { rows } = await db.query(
                'SELECT id FROM refactor_jobs WHERE id=$1 AND owner_id=$2', [body.job_id, userId]
            );
            if (!rows[0]) return reply.status(403).send({ error: { code: 'JOB_NOT_OWNED', message: 'Access denied.', details: {} } });
        }

        const externalTicketId = `IAMA-${Date.now()}`;
        const payloadMode = body.consent_to_share_logs ? 'WITH_CONTEXT' : 'METADATA_ONLY';

        const { rows: [ticket] } = await db.query<{ id: string; created_at: string }>(
            `INSERT INTO support_ticket_logs
         (user_id, job_id, external_ticket_id, issue_type, consent_given, payload_mode)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
            [userId, body.job_id ?? null, externalTicketId, body.issue_type, body.consent_to_share_logs ?? false, payloadMode]
        );

        return reply.status(201).send({
            ticket_id: ticket.id,
            external_ticket_id: externalTicketId,
            created_at: ticket.created_at,
        });
    });
}
