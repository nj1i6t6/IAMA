import * as vscode from 'vscode';
import { ApiClient } from '../api/ApiClient';
import { SseManager } from '../sse/SseManager';

/**
 * HeartbeatManager — emits job heartbeats every 60s while a job is active.
 * Loss of heartbeat for 300s grace window causes CLIENT_HEARTBEAT_LOST transition.
 * Stops immediately on cancellation, completion, or extension deactivation.
 */
export class HeartbeatManager {
    private intervalHandle: ReturnType<typeof setInterval> | null = null;
    private currentJobId: string | null = null;
    private sessionId: string | null = null;
    private statusBarItem: vscode.StatusBarItem;

    constructor(private readonly apiClient: ApiClient) {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    }

    start(jobId: string, sessionId: string): void {
        this.stop();
        this.currentJobId = jobId;
        this.sessionId = sessionId;

        this.statusBarItem.text = '$(sync~spin) IAMA: Running';
        this.statusBarItem.tooltip = `Job ${jobId} in progress`;
        this.statusBarItem.command = 'iama.openDashboard';
        this.statusBarItem.show();

        this.intervalHandle = setInterval(() => this.sendHeartbeat(), 60_000);
        // Send one immediately
        this.sendHeartbeat();
    }

    stop(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
        this.currentJobId = null;
        this.sessionId = null;
        this.statusBarItem.hide();
    }

    updateState(state: string): void {
        const icons: Record<string, string> = {
            ANALYZING: '$(search~spin)',
            WAITING_STRATEGY: '$(list-selection)',
            WAITING_SPEC_APPROVAL: '$(checklist)',
            GENERATING_TESTS: '$(beaker~spin)',
            BASELINE_VALIDATION: '$(verified)',
            REFACTORING: '$(sync~spin)',
            SELF_HEALING: '$(refresh)',
            WAITING_INTERVENTION: '$(warning)',
            DEEP_FIX_ACTIVE: '$(flame~spin)',
            DELIVERED: '$(check)',
            FAILED: '$(x)',
            FALLBACK_REQUIRED: '$(history)',
        };
        const icon = icons[state] ?? '$(circle-outline)';
        this.statusBarItem.text = `${icon} IAMA: ${state.replace(/_/g, ' ')}`;
        this.statusBarItem.tooltip = `IAMA Job: ${state}`;

        if (['DELIVERED', 'FAILED', 'FALLBACK_REQUIRED'].includes(state)) {
            this.stop();
        }
    }

    private async sendHeartbeat(): Promise<void> {
        if (!this.currentJobId || !this.sessionId) return;
        try {
            await this.apiClient.sendHeartbeat(this.currentJobId, this.sessionId);
        } catch (err) {
            // Heartbeat failure is not fatal — Temporal handles the grace window
            console.error('[IAMA] Heartbeat failed', err);
        }
    }
}
