import * as vscode from 'vscode';
import { ApiClient } from '../api/ApiClient';
import { SseManager } from '../sse/SseManager';

export class JobStatusProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private activeJobId: string | null = null;
    private activeJobState: string | null = null;
    private jobs: any[] = [];

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly apiClient: ApiClient,
        private readonly sseManager: SseManager,
    ) { }

    getActiveJobId(): string | null { return this.activeJobId; }

    async setActiveJob(jobId: string, state: string): Promise<void> {
        this.activeJobId = jobId;
        this.activeJobState = state;
        this._onDidChangeTreeData.fire(undefined);
    }

    async refresh(): Promise<void> {
        try {
            const result = await this.apiClient.listJobs();
            this.jobs = (result as any).items ?? [];
        } catch { this.jobs = []; }
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    getChildren(): vscode.TreeItem[] {
        const items: vscode.TreeItem[] = [];

        if (this.activeJobId && this.activeJobState) {
            const activeItem = new vscode.TreeItem(`Active: ${this.activeJobState}`, vscode.TreeItemCollapsibleState.None);
            activeItem.description = this.activeJobId.slice(0, 8);
            activeItem.iconPath = new vscode.ThemeIcon('sync');
            activeItem.contextValue = 'activeJob';
            items.push(activeItem);
        }

        for (const job of this.jobs.slice(0, 10)) {
            const item = new vscode.TreeItem(job.status, vscode.TreeItemCollapsibleState.None);
            item.description = job.job_id.slice(0, 8);
            item.iconPath = new vscode.ThemeIcon(job.status === 'DELIVERED' ? 'check' : 'circle-outline');
            items.push(item);
        }

        if (items.length === 0) {
            items.push(new vscode.TreeItem('No jobs yet. Run IAMA: Start Refactor.'));
        }

        return items;
    }
}

export class DashboardProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly context: vscode.ExtensionContext, private readonly apiClient: ApiClient) { }

    getTreeItem(e: vscode.TreeItem) { return e; }

    async getChildren(): Promise<vscode.TreeItem[]> {
        try {
            const sub = await this.apiClient.getSubscription() as any;
            return [
                Object.assign(new vscode.TreeItem(`Tier: ${sub.tier ?? 'FREE'}`), { iconPath: new vscode.ThemeIcon('account') }),
                Object.assign(new vscode.TreeItem(`Mode: ${sub.operating_mode ?? 'SIMPLE'}`), { iconPath: new vscode.ThemeIcon('settings') }),
            ];
        } catch {
            return [new vscode.TreeItem('Sign in to view account details.')];
        }
    }
}

export class HistoryProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly context: vscode.ExtensionContext, private readonly apiClient: ApiClient) { }

    getTreeItem(e: vscode.TreeItem) { return e; }

    async getChildren(): Promise<vscode.TreeItem[]> {
        try {
            const result = await this.apiClient.listJobs() as any;
            const jobs = result.items ?? [];
            if (jobs.length === 0) return [new vscode.TreeItem('No job history.')];
            return jobs.slice(0, 20).map((j: any) => {
                const item = new vscode.TreeItem(j.status);
                item.description = `${j.job_id.slice(0, 8)} • ${new Date(j.created_at).toLocaleDateString()}`;
                item.iconPath = new vscode.ThemeIcon(j.status === 'DELIVERED' ? 'check' : j.status === 'FAILED' ? 'x' : 'circle-outline');
                return item;
            });
        } catch {
            return [new vscode.TreeItem('Sign in to view history.')];
        }
    }
}
