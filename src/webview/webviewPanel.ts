import * as vscode from 'vscode';
import { WebSocketManager, MessageData } from '../webSocketManager';

export class WebviewPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'ws-client.webview';
    private _view?: vscode.WebviewView;
    private webSocketManager: WebSocketManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        webSocketManager: WebSocketManager
    ) {
        this.webSocketManager = webSocketManager;
        this.webSocketManager.addMessageHandler(this.handleWebSocketMessage.bind(this));
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'connect':
                    await this.handleConnect(data.url);
                    break;
                case 'disconnect':
                    this.handleDisconnect();
                    break;
                case 'send':
                    this.handleSendMessage(data.message);
                    break;
                case 'getHistory':
                    this.sendHistory();
                    break;
                case 'getStatus':
                    this.sendStatus();
                    break;
            }
        });

        // Send initial status
        this.sendStatus();
    }

    private async handleConnect(url: string) {
        try {
            await this.webSocketManager.connect(url);
        } catch (error) {
            this.postMessage({
                type: 'error',
                data: error instanceof Error ? error.message : 'Connection failed'
            });
        }
    }

    private handleDisconnect() {
        this.webSocketManager.disconnect();
    }

    private handleSendMessage(message: string) {
        if (!message.trim()) {
            this.postMessage({
                type: 'error',
                data: 'Message cannot be empty'
            });
            return;
        }

        const success = this.webSocketManager.sendMessage(message);
        if (success) {
            this.postMessage({
                type: 'messageSent',
                data: message,
                timestamp: Date.now()
            });
        }
    }

    private handleWebSocketMessage(data: MessageData) {
        this.postMessage({
            type: 'wsEvent',
            eventType: data.type,
            data: data.data,
            timestamp: data.timestamp
        });
    }

    private sendHistory() {
        const history = this.webSocketManager.getUrlHistory();
        this.postMessage({
            type: 'history',
            data: history
        });
    }

    private sendStatus() {
        this.postMessage({
            type: 'status',
            data: {
                status: this.webSocketManager.getStatus(),
                url: this.webSocketManager.getCurrentUrl(),
                isConnected: this.webSocketManager.isConnected()
            }
        });
    }

    private postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    public static createOrShow(extensionUri: vscode.Uri, webSocketManager: WebSocketManager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const panel = vscode.window.createWebviewPanel(
            WebviewPanel.viewType,
            'WebSocket Client',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        const webviewProvider = new WebviewPanel(extensionUri, webSocketManager);
        webviewProvider.resolveWebviewView(panel as any, {} as any, {} as any);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WebSocket Client</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 16px;
                }

                .container {
                    max-width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .section {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 6px;
                    padding: 12px;
                }

                .section-title {
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 12px;
                    color: var(--vscode-editor-foreground);
                    opacity: 0.9;
                }

                .url-input-group {
                    display: flex;
                    gap: 8px;
                }

                input, textarea, select {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px;
                    border-radius: 4px;
                    font-family: var(--vscode-font-family);
                    font-size: 13px;
                    width: 100%;
                }

                input:focus, textarea:focus, select:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                }

                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: background-color 0.2s;
                    white-space: nowrap;
                }

                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }

                button.secondary {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }

                button.secondary:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }

                button.danger {
                    background-color: var(--vscode-errorForeground);
                    opacity: 0.8;
                }

                button.danger:hover {
                    opacity: 1;
                }

                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .status-bar {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    background-color: var(--vscode-statusBar-background);
                    border-radius: 4px;
                    font-size: 12px;
                }

                .status-indicator {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                }

                .status-connected {
                    background-color: #4caf50;
                }

                .status-disconnected {
                    background-color: #f44336;
                }

                .status-connecting {
                    background-color: #ff9800;
                }

                .history-dropdown {
                    margin-top: 8px;
                    width: 100%;
                }

                .messages-area {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    min-height: 200px;
                    max-height: 400px;
                    overflow-y: auto;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 12px;
                    padding: 8px;
                }

                .message-item {
                    padding: 8px;
                    margin-bottom: 8px;
                    border-radius: 4px;
                    word-wrap: break-word;
                }

                .message-incoming {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-left: 3px solid #4caf50;
                }

                .message-outgoing {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-left: 3px solid #2196f3;
                }

                .message-error {
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border-left: 3px solid #f44336;
                    color: var(--vscode-inputValidation-errorForeground);
                }

                .message-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 4px;
                    font-size: 11px;
                    opacity: 0.7;
                }

                .message-content {
                    font-family: monospace;
                    white-space: pre-wrap;
                }

                .input-group {
                    display: flex;
                    gap: 8px;
                    align-items: flex-start;
                }

                .input-group textarea {
                    flex: 1;
                    resize: vertical;
                    min-height: 60px;
                }

                .url-history-container {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .button-group {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="status-bar">
                    <span id="statusIndicator" class="status-indicator status-disconnected"></span>
                    <span id="statusText">Disconnected</span>
                    <span id="urlText" style="opacity: 0.7;"></span>
                </div>

                <div class="section">
                    <div class="section-title">Connection Settings</div>
                    <div class="url-history-container">
                        <select id="historySelect" class="history-dropdown" style="display: none;" onchange="useHistoryUrl()">
                            <option value="">Recent URLs</option>
                        </select>
                        <div class="url-input-group">
                            <input type="text" id="urlInput" placeholder="ws://localhost:8080 or wss://example.com" />
                            <button id="toggleHistoryBtn" class="secondary" onclick="toggleHistory()">▼</button>
                        </div>
                        <div class="button-group">
                            <button id="connectBtn" onclick="connect()">Connect</button>
                            <button id="disconnectBtn" class="secondary" onclick="disconnect()">Disconnect</button>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Send Message</div>
                    <div class="input-group">
                        <textarea id="messageInput" placeholder="Type your message here..."></textarea>
                        <button id="sendBtn" onclick="sendMessage()">Send</button>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Messages</div>
                    <div id="messagesArea" class="messages-area"></div>
                    <div style="margin-top: 8px;">
                        <button class="secondary" onclick="clearMessages()">Clear Messages</button>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let showHistory = false;

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'wsEvent':
                            handleWebSocketEvent(message.eventType, message.data, message.timestamp);
                            break;
                        case 'error':
                            addMessage('error', message.data, message.timestamp);
                            break;
                        case 'messageSent':
                            addMessage('outgoing', message.data, message.timestamp);
                            break;
                        case 'history':
                            updateHistoryDropdown(message.data);
                            break;
                        case 'status':
                            updateStatus(message.data);
                            break;
                    }
                });

                function connect() {
                    const url = document.getElementById('urlInput').value.trim();
                    if (!url) {
                        vscode.postMessage({ type: 'connect', url: '' });
                        return;
                    }
                    vscode.postMessage({ type: 'connect', url: url });
                    addMessage('system', 'Connecting to ' + url + '...');
                }

                function disconnect() {
                    vscode.postMessage({ type: 'disconnect' });
                    addMessage('system', 'Disconnecting...');
                }

                function sendMessage() {
                    const input = document.getElementById('messageInput');
                    const message = input.value.trim();
                    if (message) {
                        vscode.postMessage({ type: 'send', message: message });
                        input.value = '';
                    }
                }

                function handleWebSocketEvent(eventType, data, timestamp) {
                    switch (eventType) {
                        case 'connected':
                            addMessage('system', 'Connected to ' + data.url, timestamp);
                            requestHistory();
                            break;
                        case 'disconnected':
                            addMessage('system', 'Disconnected', timestamp);
                            break;
                        case 'message':
                            try {
                                // Try to parse as JSON for better display
                                const parsed = JSON.parse(data);
                                addMessage('incoming', JSON.stringify(parsed, null, 2), timestamp);
                            } catch {
                                addMessage('incoming', data, timestamp);
                            }
                            break;
                        case 'error':
                            addMessage('error', data, timestamp);
                            break;
                    }
                    requestStatus();
                }

                function addMessage(type, content, timestamp) {
                    const messagesArea = document.getElementById('messagesArea');
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message-item message-' + (type === 'error' ? 'error' : 
                                                                    type === 'incoming' ? 'incoming' : 
                                                                    type === 'outgoing' ? 'outgoing' : 
                                                                    'system');
                    
                    const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
                    const header = document.createElement('div');
                    header.className = 'message-header';
                    header.innerHTML = '<span>' + (type === 'incoming' ? '📩 Received' : 
                                                  type === 'outgoing' ? '📤 Sent' : 
                                                  type === 'error' ? '❌ Error' : 'ℹ️ System') + '</span>' +
                                      '<span>' + time + '</span>';
                    
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'message-content';
                    contentDiv.textContent = content;
                    
                    messageDiv.appendChild(header);
                    messageDiv.appendChild(contentDiv);
                    messagesArea.appendChild(messageDiv);
                    messagesArea.scrollTop = messagesArea.scrollHeight;
                }

                function clearMessages() {
                    document.getElementById('messagesArea').innerHTML = '';
                }

                function updateStatus(status) {
                    const statusText = document.getElementById('statusText');
                    const urlText = document.getElementById('urlText');
                    const indicator = document.getElementById('statusIndicator');
                    
                    statusText.textContent = status.status;
                    urlText.textContent = status.url ? ' - ' + status.url : '';
                    
                    indicator.className = 'status-indicator';
                    if (status.status === 'Connected') {
                        indicator.classList.add('status-connected');
                    } else if (status.status === 'Connecting...') {
                        indicator.classList.add('status-connecting');
                    } else {
                        indicator.classList.add('status-disconnected');
                    }
                }

                function requestHistory() {
                    vscode.postMessage({ type: 'getHistory' });
                }

                function requestStatus() {
                    vscode.postMessage({ type: 'getStatus' });
                }

                function updateHistoryDropdown(history) {
                    const select = document.getElementById('historySelect');
                    select.innerHTML = '<option value="">Recent URLs</option>';
                    history.forEach(url => {
                        const option = document.createElement('option');
                        option.value = url;
                        option.textContent = url;
                        select.appendChild(option);
                    });
                }

                function toggleHistory() {
                    const select = document.getElementById('historySelect');
                    const btn = document.getElementById('toggleHistoryBtn');
                    if (showHistory) {
                        select.style.display = 'none';
                        btn.textContent = '▼';
                    } else {
                        select.style.display = 'block';
                        btn.textContent = '▲';
                        requestHistory();
                    }
                    showHistory = !showHistory;
                }

                function useHistoryUrl() {
                    const select = document.getElementById('historySelect');
                    const urlInput = document.getElementById('urlInput');
                    if (select.value) {
                        urlInput.value = select.value;
                        select.style.display = 'none';
                        showHistory = false;
                        document.getElementById('toggleHistoryBtn').textContent = '▼';
                    }
                }

                // Load initial status and history
                requestStatus();
                requestHistory();

                // Keyboard shortcuts
                document.getElementById('urlInput').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        connect();
                    }
                });

                document.getElementById('messageInput').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                        sendMessage();
                    }
                });
            </script>
        </body>
        </html>`;
    }
}