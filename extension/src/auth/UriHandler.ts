import * as vscode from 'vscode';
import { AuthProvider } from './AuthProvider';

/**
 * Handles the OAuth callback deep-link:
 *   vscode://iama.extension/auth?token=ACCESS_TOKEN
 *
 * Per AGENT_DEVELOPMENT_GUIDE.md resolution #19:
 * - IDE extension clients (Electron/Node.js) are exempt from the
 *   @microsoft/fetch-event-source SSE requirement.
 * - OAuth callback arrives via URI handler (deep-link), not query param token.
 */
export class UriHandler implements vscode.UriHandler {
    constructor(
        private readonly authProvider: AuthProvider,
        private readonly context: vscode.ExtensionContext,
    ) { }

    async handleUri(uri: vscode.Uri): Promise<void> {
        const params = new URLSearchParams(uri.query);
        const token = params.get('token');

        if (!token) {
            vscode.window.showErrorMessage('IAMA: OAuth callback did not include a token.');
            return;
        }

        await this.authProvider.setTokens(token);
        vscode.window.showInformationMessage('IAMA: Signed in successfully!');

        // Refresh the status bar and webviews
        vscode.commands.executeCommand('iama.openDashboard');
    }
}
