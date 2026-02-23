import * as vscode from 'vscode';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { ApiClient } from '../api/ApiClient';
import { AuthProvider } from '../auth/AuthProvider';

type SseEventHandler = (event: SseEvent) => void;

interface SseEvent {
    event: string;
    state?: string;
    timestamp: string;
    [key: string]: unknown;
}

/**
 * SseManager — manages Server-Sent Events connection for job log streaming.
 *
 * Per AGENT_DEVELOPMENT_GUIDE.md resolution #19:
 * - MUST use @microsoft/fetch-event-source (not native EventSource)
 * - URL query parameter tokens are PROHIBITED
 * - Authorization header is sent via fetch options (IDE/Electron is exempt from browser limitation)
 */
export class SseManager {
    private controller: AbortController | null = null;
    private handlers: Set<SseEventHandler> = new Set();

    constructor(private readonly apiClient: ApiClient) { }

    async connect(jobId: string, token: string, baseUrl: string): Promise<void> {
        this.close();

        this.controller = new AbortController();
        const url = `${baseUrl}/api/v1/jobs/${jobId}/logs`;

        // NOTE: Token sent in Authorization header — NEVER in URL query parameter
        fetchEventSource(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'text/event-stream',
            },
            signal: this.controller.signal,
            onmessage: (msg) => {
                try {
                    const data: SseEvent = JSON.parse(msg.data);
                    this.handlers.forEach((h) => h(data));
                } catch {
                    // Ignore malformed events
                }
            },
            onerror: (err) => {
                console.error('[IAMA] SSE error', err);
                // @microsoft/fetch-event-source auto-reconnects — do not throw here
            },
        });
    }

    onEvent(handler: SseEventHandler): () => void {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    close(): void {
        this.controller?.abort();
        this.controller = null;
        this.handlers.clear();
    }
}
