import * as vscode from 'vscode';
import { WebSocketManager } from './webSocketManager';
import { WebviewPanel } from './webview/webviewPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('WebSocket Client extension is now active!');

    const webSocketManager = new WebSocketManager();

    // Register the command to open WebSocket panel
    const openCommand = vscode.commands.registerCommand('ws-client.open', () => {
        WebviewPanel.createOrShow(context.extensionUri, webSocketManager);
    });

    context.subscriptions.push(openCommand);

    // Register the provider for webview content
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'ws-client.webview',
            new WebviewPanel(context.extensionUri, webSocketManager)
        )
    );
}

export function deactivate() {
    // Clean up WebSocket connections
    WebSocketManager.cleanup();
}