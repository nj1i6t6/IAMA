import * as vscode from 'vscode';
import { AuthProvider } from './auth/AuthProvider';
import { ApiClient } from './api/ApiClient';
import { HeartbeatManager } from './heartbeat/HeartbeatManager';
import { SseManager } from './sse/SseManager';
import { JobStatusProvider } from './views/JobStatusProvider';
import { DashboardProvider } from './views/DashboardProvider';
import { HistoryProvider } from './views/HistoryProvider';
import { UriHandler } from './auth/UriHandler';
import { CommandRegistry } from './commands/CommandRegistry';

let heartbeatManager: HeartbeatManager | null = null;
let sseManager: SseManager | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('iama');
    const apiBase = config.get<string>('apiBaseUrl', 'http://localhost:3000');

    const authProvider = new AuthProvider(context);
    const apiClient = new ApiClient(apiBase, authProvider);

    heartbeatManager = new HeartbeatManager(apiClient);
    sseManager = new SseManager(apiClient);

    const jobStatusView = new JobStatusProvider(context, apiClient, sseManager);
    const dashboardView = new DashboardProvider(context, apiClient);
    const historyView = new HistoryProvider(context, apiClient);

    // Register tree views
    context.subscriptions.push(
        vscode.window.createTreeView('iama.jobStatus', { treeDataProvider: jobStatusView }),
        vscode.window.createTreeView('iama.dashboard', { treeDataProvider: dashboardView }),
        vscode.window.createTreeView('iama.history', { treeDataProvider: historyView }),
    );

    // Register URI handler for OAuth deep-link: vscode://iama.extension/auth?token=...
    const uriHandler = new UriHandler(authProvider, context);
    context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

    // Register all commands
    const registry = new CommandRegistry(context, apiClient, authProvider, heartbeatManager, sseManager, jobStatusView);
    registry.registerAll();

    // Restore active job on extension activate
    await jobStatusView.refresh();
}

export function deactivate(): void {
    heartbeatManager?.stop();
    sseManager?.close();
}
