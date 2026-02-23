import * as vscode from 'vscode';
import { ApiClient } from '../api/ApiClient';
import { AuthProvider } from '../auth/AuthProvider';
import { HeartbeatManager } from '../heartbeat/HeartbeatManager';
import { SseManager } from '../sse/SseManager';
import { JobStatusProvider } from '../views/JobStatusProvider';
import { v4 as uuidv4 } from 'uuid';

export class CommandRegistry {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly apiClient: ApiClient,
        private readonly authProvider: AuthProvider,
        private readonly heartbeatManager: HeartbeatManager,
        private readonly sseManager: SseManager,
        private readonly jobStatusProvider: JobStatusProvider,
    ) { }

    registerAll(): void {
        const cmds = [
            vscode.commands.registerCommand('iama.login', () => this.login()),
            vscode.commands.registerCommand('iama.logout', () => this.logout()),
            vscode.commands.registerCommand('iama.startRefactor', () => this.startRefactor()),
            vscode.commands.registerCommand('iama.cancelJob', () => this.cancelJob()),
            vscode.commands.registerCommand('iama.applyDelivery', () => this.applyDelivery()),
            vscode.commands.registerCommand('iama.revertDelivery', () => this.revertDelivery()),
            vscode.commands.registerCommand('iama.openDashboard', () => this.openDashboard()),
            vscode.commands.registerCommand('iama.viewJobHistory', () => this.viewJobHistory()),
            vscode.commands.registerCommand('iama.openInterventionPanel', () => this.openInterventionPanel()),
        ];
        cmds.forEach((cmd) => this.context.subscriptions.push(cmd));
    }

    private async login(): Promise<void> {
        const config = vscode.workspace.getConfiguration('iama');
        const apiBase = config.get<string>('apiBaseUrl', 'http://localhost:3000');

        const res = await fetch(`${apiBase}/api/v1/auth/oauth/github/initiate`);
        const { authorization_url } = await res.json() as { authorization_url: string };

        await vscode.env.openExternal(vscode.Uri.parse(authorization_url));
        vscode.window.showInformationMessage('IAMA: Browser opened for GitHub sign-in. Complete sign-in to continue.');
    }

    private async logout(): Promise<void> {
        await this.authProvider.clearTokens();
        this.heartbeatManager.stop();
        this.sseManager.close();
        vscode.window.showInformationMessage('IAMA: Signed out.');
        await this.jobStatusProvider.refresh();
    }

    private async startRefactor(): Promise<void> {
        if (!(await this.authProvider.isAuthenticated())) {
            vscode.window.showWarningMessage('IAMA: Please sign in first.', 'Sign In')
                .then((v) => v && vscode.commands.executeCommand('iama.login'));
            return;
        }

        const config = vscode.workspace.getConfiguration('iama');
        const executionMode = config.get<string>('executionMode', 'LOCAL_NATIVE');

        // Get target paths from editor selection or workspace
        const editor = vscode.window.activeTextEditor;
        const targetPaths = editor ? [editor.document.fileName] : [];

        if (targetPaths.length === 0) {
            vscode.window.showWarningMessage('IAMA: Open a file or select code to refactor.');
            return;
        }

        const context = await vscode.window.showInputBox({
            prompt: 'Describe the refactoring goal (optional)',
            placeHolder: 'e.g. Modernize async/await usage, improve type safety',
        });

        try {
            const job = await this.apiClient.createJob({
                target_paths: targetPaths,
                execution_mode: executionMode,
                refactor_context: context,
            }) as any;

            await this.apiClient.startJob(job.job_id);

            // Start heartbeat and SSE connection
            const sessionId = uuidv4();
            const accessToken = await this.authProvider.getAccessToken();
            const apiBase = config.get<string>('apiBaseUrl', 'http://localhost:3000');

            this.heartbeatManager.start(job.job_id, sessionId);
            await this.sseManager.connect(job.job_id, accessToken ?? '', apiBase);

            // Update UI on SSE events
            this.sseManager.onEvent((evt) => {
                if (evt.event === 'state_change' && evt.state) {
                    this.heartbeatManager.updateState(evt.state as string);
                    this.jobStatusProvider.setActiveJob(job.job_id, evt.state as string);
                    this.handleStateTransition(job.job_id, evt.state as string);
                }
            });

            await this.jobStatusProvider.setActiveJob(job.job_id, 'ANALYZING');
            vscode.window.showInformationMessage(`IAMA: Refactor started (Job ${job.job_id.slice(0, 8)}…)`);

        } catch (err: any) {
            vscode.window.showErrorMessage(`IAMA: Failed to start refactor — ${err.message}`);
        }
    }

    private handleStateTransition(jobId: string, state: string): void {
        switch (state) {
            case 'WAITING_STRATEGY':
                vscode.window.showInformationMessage('IAMA: Strategy proposals ready. Open Dashboard to review.');
                break;
            case 'WAITING_SPEC_APPROVAL':
                vscode.window.showInformationMessage('IAMA: Spec ready for your approval.');
                break;
            case 'WAITING_INTERVENTION':
                vscode.commands.executeCommand('iama.openInterventionPanel');
                break;
            case 'DELIVERED':
                vscode.window.showInformationMessage('IAMA: Refactoring complete!', 'Apply Now', 'Later')
                    .then((v) => v === 'Apply Now' && vscode.commands.executeCommand('iama.applyDelivery'));
                break;
            case 'FAILED':
                vscode.window.showErrorMessage('IAMA: Refactoring failed. See Job History for details.');
                break;
        }
    }

    private async cancelJob(): Promise<void> {
        const jobId = this.jobStatusProvider.getActiveJobId();
        if (!jobId) { vscode.window.showInformationMessage('No active IAMA job.'); return; }

        const confirm = await vscode.window.showWarningMessage(
            'Cancel the current refactoring job?', { modal: true }, 'Yes, Cancel'
        );
        if (confirm !== 'Yes, Cancel') return;

        await this.apiClient.cancelJob(jobId);
        this.heartbeatManager.stop();
        this.sseManager.close();
        await this.jobStatusProvider.refresh();
        vscode.window.showInformationMessage('IAMA: Job cancelled.');
    }

    private async applyDelivery(): Promise<void> {
        const jobId = this.jobStatusProvider.getActiveJobId();
        if (!jobId) { vscode.window.showWarningMessage('No delivered IAMA job found.'); return; }
        await this.apiClient.applyDelivery(jobId);
        vscode.window.showInformationMessage('IAMA: Refactoring applied to workspace.');
        await this.jobStatusProvider.refresh();
    }

    private async revertDelivery(): Promise<void> {
        const jobId = this.jobStatusProvider.getActiveJobId();
        if (!jobId) { vscode.window.showWarningMessage('No delivered IAMA job found.'); return; }
        const confirm = await vscode.window.showWarningMessage('Revert the applied refactoring?', { modal: true }, 'Yes, Revert');
        if (confirm !== 'Yes, Revert') return;
        await this.apiClient.revertDelivery(jobId);
        vscode.window.showInformationMessage('IAMA: Refactoring reverted.');
        await this.jobStatusProvider.refresh();
    }

    private openDashboard(): void {
        // In a full implementation this opens a WebviewPanel with job details
        vscode.window.showInformationMessage('IAMA Dashboard — see Job Status panel in the sidebar.');
    }

    private viewJobHistory(): void {
        vscode.commands.executeCommand('workbench.view.extension.iama');
    }

    private async openInterventionPanel(): Promise<void> {
        // Intervention UI follows Command Panel pattern (V1-FR-DEL-002):
        // Natural language input at top of viewport, not chat bubbles.
        const jobId = this.jobStatusProvider.getActiveJobId();
        if (!jobId) return;

        const command = await vscode.window.showInputBox({
            prompt: 'IAMA Intervention — describe what to try next (or type "deep fix")',
            placeHolder: 'e.g. Try a different approach for the async functions',
        });

        if (!command) return;

        if (command.trim().toLowerCase() === 'deep fix') {
            await this.apiClient.deepFix(jobId);
            vscode.window.showInformationMessage('IAMA: Deep Fix activated.');
        } else {
            await this.apiClient.sendCommand(jobId, command);
            vscode.window.showInformationMessage('IAMA: Command sent to refactoring agent.');
        }
    }
}
