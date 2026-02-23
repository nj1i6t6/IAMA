import * as vscode from 'vscode';

const TOKEN_KEY = 'iama.accessToken';
const REFRESH_TOKEN_KEY = 'iama.refreshToken';
const USER_ID_KEY = 'iama.userId';

export class AuthProvider {
    constructor(private readonly context: vscode.ExtensionContext) { }

    async getAccessToken(): Promise<string | null> {
        return this.context.secrets.get(TOKEN_KEY) ?? null;
    }

    async setTokens(accessToken: string, refreshToken?: string): Promise<void> {
        await this.context.secrets.store(TOKEN_KEY, accessToken);
        if (refreshToken) {
            await this.context.secrets.store(REFRESH_TOKEN_KEY, refreshToken);
        }
    }

    async clearTokens(): Promise<void> {
        await this.context.secrets.delete(TOKEN_KEY);
        await this.context.secrets.delete(REFRESH_TOKEN_KEY);
        await this.context.secrets.delete(USER_ID_KEY);
    }

    async isAuthenticated(): Promise<boolean> {
        return !!(await this.getAccessToken());
    }

    /** Called when access token expires — tries to refresh silently */
    async refreshAccessToken(apiBase: string): Promise<string | null> {
        const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_KEY);
        if (!refreshToken) return null;

        try {
            const res = await fetch(`${apiBase}/api/v1/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });

            if (!res.ok) {
                await this.clearTokens();
                return null;
            }

            const { access_token } = await res.json() as { access_token: string };
            await this.context.secrets.store(TOKEN_KEY, access_token);
            return access_token;
        } catch {
            return null;
        }
    }
}
