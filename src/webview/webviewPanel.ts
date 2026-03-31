import * as vscode from 'vscode';
import { WebSocketManager, MessageData } from '../webSocketManager';
import { RequestHeader } from '../types';

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
                case 'saveRequest':
                    // Delegate to the command which handles the QuickPick UI
                    await vscode.commands.executeCommand(
                        'ws-client.collections.saveRequest',
                        {
                            url: data.url,
                            message: data.message,
                            headers: data.headers as RequestHeader[],
                        }
                    );
                    break;
            }
        });

        this.sendStatus();
    }

    /**
     * Load a saved request from the collections tree into the panel.
     * Called by the collectionsCommands loadRequest handler.
     */
    public loadRequest(url: string, message: string, headers: RequestHeader[]): void {
        this.postMessage({ type: 'loadRequest', url, message, headers });
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
            this.postMessage({ type: 'error', data: 'Message cannot be empty' });
            return;
        }
        const success = this.webSocketManager.sendMessage(message);
        if (success) {
            this.postMessage({ type: 'messageSent', data: message, timestamp: Date.now() });
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
        this.postMessage({ type: 'history', data: history });
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
                * { margin: 0; padding: 0; box-sizing: border-box; }

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

                .url-input-group { display: flex; gap: 8px; }

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

                button:hover { background-color: var(--vscode-button-hoverBackground); }

                button.secondary {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }

                button.secondary:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }

                button.save-btn {
                    background-color: transparent;
                    border: 1px solid var(--vscode-button-background);
                    color: var(--vscode-button-background);
                    padding: 8px 12px;
                    font-size: 12px;
                }

                button.save-btn:hover {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }

                button:disabled { opacity: 0.5; cursor: not-allowed; }

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
                    flex-shrink: 0;
                }

                .status-connected    { background-color: #4caf50; }
                .status-disconnected { background-color: #f44336; }
                .status-connecting   { background-color: #ff9800; }

                .history-dropdown { margin-top: 8px; width: 100%; }

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

                .message-content { font-family: monospace; white-space: pre-wrap; }

                .input-group { display: flex; gap: 8px; align-items: flex-start; }
                .input-group textarea { flex: 1; resize: vertical; min-height: 60px; }

                .send-actions { display: flex; gap: 8px; flex-direction: column; }

                .url-history-container { display: flex; flex-direction: column; gap: 8px; }
                .button-group { display: flex; gap: 8px; flex-wrap: wrap; }

                /* Headers table */
                .headers-section { margin-top: 10px; }
                .headers-label {
                    font-size: 12px;
                    opacity: 0.7;
                    margin-bottom: 6px;
                    cursor: pointer;
                    user-select: none;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .headers-table { width: 100%; border-collapse: collapse; font-size: 12px; }
                .headers-table th {
                    text-align: left;
                    padding: 4px 6px;
                    opacity: 0.6;
                    font-weight: normal;
                }
                .headers-table td { padding: 3px 2px; }
                .headers-table input {
                    padding: 4px 6px;
                    font-size: 12px;
                }

                .header-row-enabled { opacity: 1; }
                .header-row-disabled { opacity: 0.4; }

                .btn-icon {
                    background: transparent;
                    border: none;
                    padding: 2px 6px;
                    cursor: pointer;
                    color: var(--vscode-editor-foreground);
                    opacity: 0.5;
                    font-size: 14px;
                }
                .btn-icon:hover { opacity: 1; background: transparent; }

                .add-header-btn {
                    margin-top: 6px;
                    font-size: 11px;
                    padding: 4px 8px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Status bar -->
                <div class="status-bar">
                    <span id="statusIndicator" class="status-indicator status-disconnected"></span>
                    <span id="statusText">Disconnected</span>
                    <span id="urlText" style="opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></span>
                </div>

                <!-- Connection -->
                <div class="section">
                    <div class="section-title">Connection</div>
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

                <!-- Send Message -->
                <div class="section">
                    <div class="section-title">Send Message</div>

                    <!-- Headers (collapsible) -->
                    <div class="headers-section">
                        <div class="headers-label" onclick="toggleHeaders()">
                            <span id="headersArrow">▶</span>
                            <span>Headers</span>
                            <span id="headersCount" style="opacity:0.5;"></span>
                        </div>
                        <div id="headersBody" style="display:none;">
                            <table class="headers-table">
                                <thead>
                                    <tr>
                                        <th style="width:24px;"></th>
                                        <th>Key</th>
                                        <th>Value</th>
                                        <th style="width:28px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="headersTableBody"></tbody>
                            </table>
                            <button class="secondary add-header-btn" onclick="addHeaderRow()">+ Add header</button>
                        </div>
                    </div>

                    <div class="input-group" style="margin-top: 10px;">
                        <textarea id="messageInput" placeholder="Type your message here… (Ctrl+Enter to send)"></textarea>
                        <div class="send-actions">
                            <button id="sendBtn" onclick="sendMessage()">Send</button>
                            <button class="save-btn" onclick="saveRequest()" title="Save to collections">💾 Save</button>
                        </div>
                    </div>
                </div>

                <!-- Messages -->
                <div class="section">
                    <div class="section-title">Messages</div>
                    <div id="messagesArea" class="messages-area"></div>
                    <div style="margin-top: 8px;">
                        <button class="secondary" onclick="clearMessages()">Clear</button>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let showHistory = false;
                let showHeaders = false;

                // ─── Message handler from extension ──────────────────────

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
                        case 'loadRequest':
                            loadRequest(message.url, message.message, message.headers);
                            break;
                    }
                });

                // ─── Load saved request from Collections tree ─────────────

                function loadRequest(url, message, headers) {
                    document.getElementById('urlInput').value = url || '';
                    document.getElementById('messageInput').value = message || '';

                    // Rebuild headers table
                    const tbody = document.getElementById('headersTableBody');
                    tbody.innerHTML = '';
                    (headers || []).forEach(h => addHeaderRow(h.key, h.value, h.enabled));
                    updateHeadersCount();

                    addMessage('system', '📂 Loaded: ' + url);
                }

                // ─── Connection ───────────────────────────────────────────

                function connect() {
                    const url = document.getElementById('urlInput').value.trim();
                    vscode.postMessage({ type: 'connect', url });
                    addMessage('system', 'Connecting to ' + url + '…');
                }

                function disconnect() {
                    vscode.postMessage({ type: 'disconnect' });
                    addMessage('system', 'Disconnecting…');
                }

                // ─── Send ─────────────────────────────────────────────────

                function sendMessage() {
                    const input = document.getElementById('messageInput');
                    const message = input.value.trim();
                    if (message) {
                        vscode.postMessage({ type: 'send', message });
                        input.value = '';
                    }
                }

                // ─── Save to collections ──────────────────────────────────

                function saveRequest() {
                    const url = document.getElementById('urlInput').value.trim();
                    const message = document.getElementById('messageInput').value.trim();
                    const headers = getHeaders();

                    if (!url) {
                        addMessage('error', 'Enter a WebSocket URL before saving.');
                        return;
                    }

                    vscode.postMessage({ type: 'saveRequest', url, message, headers });
                }

                // ─── Headers ─────────────────────────────────────────────

                function toggleHeaders() {
                    showHeaders = !showHeaders;
                    document.getElementById('headersBody').style.display = showHeaders ? 'block' : 'none';
                    document.getElementById('headersArrow').textContent = showHeaders ? '▼' : '▶';
                }

                function addHeaderRow(key = '', value = '', enabled = true) {
                    const tbody = document.getElementById('headersTableBody');
                    const tr = document.createElement('tr');
                    tr.className = enabled ? 'header-row-enabled' : 'header-row-disabled';
                    tr.innerHTML = \`
                        <td>
                            <input type="checkbox" \${enabled ? 'checked' : ''} onchange="toggleHeaderRow(this)" title="Enable/disable header">
                        </td>
                        <td><input type="text" placeholder="Key" value="\${escHtml(key)}" oninput="updateHeadersCount()"></td>
                        <td><input type="text" placeholder="Value" value="\${escHtml(value)}"></td>
                        <td><button class="btn-icon" onclick="removeHeaderRow(this)" title="Remove">✕</button></td>
                    \`;
                    tbody.appendChild(tr);
                    updateHeadersCount();
                }

                function toggleHeaderRow(checkbox) {
                    const tr = checkbox.closest('tr');
                    tr.className = checkbox.checked ? 'header-row-enabled' : 'header-row-disabled';
                }

                function removeHeaderRow(btn) {
                    btn.closest('tr').remove();
                    updateHeadersCount();
                }

                function getHeaders() {
                    const rows = document.querySelectorAll('#headersTableBody tr');
                    return Array.from(rows).map(tr => {
                        const inputs = tr.querySelectorAll('input[type=text]');
                        const checkbox = tr.querySelector('input[type=checkbox]');
                        return {
                            key: inputs[0].value.trim(),
                            value: inputs[1].value.trim(),
                            enabled: checkbox.checked,
                        };
                    }).filter(h => h.key);
                }

                function updateHeadersCount() {
                    const count = document.querySelectorAll('#headersTableBody tr').length;
                    document.getElementById('headersCount').textContent = count > 0 ? \`(\${count})\` : '';
                }

                // ─── WebSocket events ─────────────────────────────────────

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

                // ─── Messages area ────────────────────────────────────────

                function addMessage(type, content, timestamp) {
                    const messagesArea = document.getElementById('messagesArea');
                    const div = document.createElement('div');
                    div.className = 'message-item message-' +
                        (type === 'error' ? 'error' :
                         type === 'incoming' ? 'incoming' :
                         type === 'outgoing' ? 'outgoing' : 'system');

                    const time = timestamp
                        ? new Date(timestamp).toLocaleTimeString()
                        : new Date().toLocaleTimeString();

                    const labels = {
                        incoming: '📩 Received',
                        outgoing: '📤 Sent',
                        error: '❌ Error',
                        system: 'ℹ️ System',
                    };

                    div.innerHTML =
                        '<div class="message-header">' +
                            '<span>' + (labels[type] || 'ℹ️ System') + '</span>' +
                            '<span>' + time + '</span>' +
                        '</div>' +
                        '<div class="message-content"></div>';

                    div.querySelector('.message-content').textContent = content;
                    messagesArea.appendChild(div);
                    messagesArea.scrollTop = messagesArea.scrollHeight;
                }

                function clearMessages() {
                    document.getElementById('messagesArea').innerHTML = '';
                }

                // ─── Status ───────────────────────────────────────────────

                function updateStatus(status) {
                    document.getElementById('statusText').textContent = status.status;
                    document.getElementById('urlText').textContent = status.url ? ' — ' + status.url : '';
                    const ind = document.getElementById('statusIndicator');
                    ind.className = 'status-indicator ' + (
                        status.status === 'Connected'    ? 'status-connected'    :
                        status.status === 'Connecting…'  ? 'status-connecting'   :
                                                           'status-disconnected'
                    );
                }

                // ─── URL history ──────────────────────────────────────────

                function requestHistory() { vscode.postMessage({ type: 'getHistory' }); }
                function requestStatus()  { vscode.postMessage({ type: 'getStatus' }); }

                function updateHistoryDropdown(history) {
                    const select = document.getElementById('historySelect');
                    select.innerHTML = '<option value="">Recent URLs</option>';
                    history.forEach(url => {
                        const opt = document.createElement('option');
                        opt.value = url;
                        opt.textContent = url;
                        select.appendChild(opt);
                    });
                }

                function toggleHistory() {
                    const select = document.getElementById('historySelect');
                    const btn = document.getElementById('toggleHistoryBtn');
                    showHistory = !showHistory;
                    select.style.display = showHistory ? 'block' : 'none';
                    btn.textContent = showHistory ? '▲' : '▼';
                    if (showHistory) { requestHistory(); }
                }

                function useHistoryUrl() {
                    const select = document.getElementById('historySelect');
                    if (select.value) {
                        document.getElementById('urlInput').value = select.value;
                        select.style.display = 'none';
                        showHistory = false;
                        document.getElementById('toggleHistoryBtn').textContent = '▼';
                    }
                }

                // ─── Utils ────────────────────────────────────────────────

                function escHtml(str) {
                    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }

                // ─── Init ─────────────────────────────────────────────────

                requestStatus();
                requestHistory();

                document.getElementById('urlInput').addEventListener('keypress', e => {
                    if (e.key === 'Enter') { connect(); }
                });
                document.getElementById('messageInput').addEventListener('keypress', e => {
                    if (e.key === 'Enter' && e.ctrlKey) { sendMessage(); }
                });
            </script>
        </body>
        </html>`;
    }
}
