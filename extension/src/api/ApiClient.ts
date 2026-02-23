import { AuthProvider } from '../auth/AuthProvider';

export interface ApiError {
    code: string;
    message: string;
    details: Record<string, unknown>;
}

export class ApiClient {
    constructor(
        private readonly baseUrl: string,
        private readonly authProvider: AuthProvider,
    ) { }

    private async getHeaders(): Promise<Record<string, string>> {
        const token = await this.authProvider.getAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
        const headers = await this.getHeaders();
        const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers: { ...headers, ...(options?.headers as Record<string, string> ?? {}) } });

        if (res.status === 401) {
            // Try silent refresh
            const newToken = await this.authProvider.refreshAccessToken(this.baseUrl);
            if (newToken) {
                const retryHeaders = await this.getHeaders();
                const retryRes = await fetch(`${this.baseUrl}${path}`, { ...options, headers: retryHeaders });
                if (!retryRes.ok) await this.handleError(retryRes);
                return retryRes.json() as Promise<T>;
            }
            throw new Error('UNAUTHORIZED');
        }

        if (!res.ok) await this.handleError(res);
        if (res.status === 204) return undefined as T;
        return res.json() as Promise<T>;
    }

    private async handleError(res: Response): Promise<never> {
        let body: any;
        try { body = await res.json(); } catch { body = {}; }
        const code = body?.error?.code ?? 'INTERNAL_ERROR';
        throw Object.assign(new Error(body?.error?.message ?? 'Request failed'), { code });
    }

    get<T>(path: string): Promise<T> { return this.fetch<T>(path); }
    post<T>(path: string, body?: unknown): Promise<T> { return this.fetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }); }
    patch<T>(path: string, body: unknown): Promise<T> { return this.fetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }); }
    delete<T>(path: string): Promise<T> { return this.fetch<T>(path, { method: 'DELETE' }); }

    // ─── Typed API wrappers ───────────────────────────────────────────────────

    createJob(payload: { target_paths: string[]; execution_mode: string; refactor_context?: string }) {
        return this.post('/api/v1/jobs', payload);
    }
    getJob(jobId: string) { return this.get(`/api/v1/jobs/${jobId}`); }
    listJobs() { return this.get<{ items: any[] }>('/api/v1/jobs'); }
    startJob(jobId: string) { return this.post(`/api/v1/jobs/${jobId}/start`); }
    cancelJob(jobId: string) { return this.delete(`/api/v1/jobs/${jobId}`); }
    sendHeartbeat(jobId: string, sessionId: string) {
        return this.post(`/api/v1/jobs/${jobId}/heartbeat`, { session_id: sessionId });
    }
    getSpec(jobId: string) { return this.get(`/api/v1/jobs/${jobId}/spec`); }
    approveSpec(jobId: string) { return this.post(`/api/v1/jobs/${jobId}/spec/approve`); }
    applyDelivery(jobId: string) { return this.post(`/api/v1/jobs/${jobId}/delivery/apply`, { accept_all: true }); }
    revertDelivery(jobId: string) { return this.post(`/api/v1/jobs/${jobId}/delivery/revert`); }
    deepFix(jobId: string) { return this.post(`/api/v1/jobs/${jobId}/intervention/deep-fix`); }
    sendCommand(jobId: string, command: string) {
        return this.post(`/api/v1/jobs/${jobId}/intervention/command`, { command });
    }
    getSubscription() { return this.get('/api/v1/subscription/me'); }
    createSupportTicket(payload: any) { return this.post('/api/v1/support/tickets', payload); }
}
