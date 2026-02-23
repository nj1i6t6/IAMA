import { FastifyInstance } from 'fastify';

export async function telemetryRoutes(app: FastifyInstance) {

    // POST /api/v1/telemetry/events — V1-FR-ANA-003
    // Metadata-only; server rejects any payload containing prohibited content
    app.post('/telemetry/events', async (request, reply) => {
        const body = request.body as { events?: Array<{ event_name: string; properties: object; timestamp: string }> };
        if (!body.events || !Array.isArray(body.events)) {
            return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'events array required.', details: {} } });
        }

        let accepted = 0;
        let rejected = 0;

        const PROHIBITED_KEYS = ['source_code', 'code', 'bdd_text', 'sdd_text', 'prompt', 'file_path', 'commit_message'];

        for (const evt of body.events) {
            const propKeys = Object.keys(evt.properties ?? {}).map((k) => k.toLowerCase());
            const hasPii = PROHIBITED_KEYS.some((k) => propKeys.includes(k));
            if (hasPii) {
                rejected++;
            } else {
                // In production, forward to analytics provider (PostHog, etc.)
                accepted++;
            }
        }

        return reply.send({ accepted, rejected });
    });
}
