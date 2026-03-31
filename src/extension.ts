import * as vscode from 'vscode';
import { WebSocketManager } from './webSocketManager';
import { WebviewPanel } from './webview/webviewPanel';
import { CollectionsManager } from './collectionsManager';
import { CollectionsProvider } from './collectionsProvider';
import { registerCollectionCommands } from './collectionsCommands';
import { RequestHeader } from './types';

export function activate(context: vscode.ExtensionContext) {
    console.log('WebSocket Client extension is now active!');

    // ── Core services ─────────────────────────────────────────────────────
    const webSocketManager = new WebSocketManager();
    const collectionsManager = new CollectionsManager(context);

    // ── Webview panel ─────────────────────────────────────────────────────
    const webviewProvider = new WebviewPanel(context.extensionUri, webSocketManager);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'ws-client.webview',
            webviewProvider
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ws-client.open', () => {
            WebviewPanel.createOrShow(context.extensionUri, webSocketManager);
        })
    );

    // ── Collections TreeView ──────────────────────────────────────────────
    const collectionsProvider = new CollectionsProvider(collectionsManager);

    const treeView = vscode.window.createTreeView('ws-client.collections', {
        treeDataProvider: collectionsProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    // ── Collection commands ───────────────────────────────────────────────
    /**
     * Called when the user clicks a saved request in the tree.
     * Loads the request into the webview panel.
     */
    function loadRequestInPanel(url: string, message: string, headers: RequestHeader[]) {
        webviewProvider.loadRequest(url, message, headers);
        // Reveal the webview sidebar so the user can see the loaded request
        vscode.commands.executeCommand('ws-client.webview.focus');
    }

    const collectionDisposables = registerCollectionCommands(
        context,
        collectionsManager,
        collectionsProvider,
        loadRequestInPanel
    );
    context.subscriptions.push(...collectionDisposables);
}

export function deactivate() {
    WebSocketManager.cleanup();
}
