import * as vscode from 'vscode';
import WebSocket from 'ws';

export interface MessageData {
    type: 'connected' | 'disconnected' | 'message' | 'error';
    data?: any;
    timestamp?: number;
}

export class WebSocketManager {
    private ws: WebSocket | null = null;
    private url: string = '';
    private messageHandlers: ((data: MessageData) => void)[] = [];
    private static instance: WebSocketManager;

    constructor() {
        if (!WebSocketManager.instance) {
            WebSocketManager.instance = this;
        }
        return WebSocketManager.instance;
    }

    // Connect to WebSocket
    public async connect(url: string): Promise<boolean> {
        try {
            // Validate URL
            if (!url || !url.startsWith('ws://') && !url.startsWith('wss://')) {
                throw new Error('Invalid WebSocket URL. Must start with ws:// or wss://');
            }

            // Close existing connection
            this.disconnect();

            // Save URL to history
            this.saveUrlToHistory(url);

            return new Promise((resolve, reject) => {
                try {
                    this.ws = new WebSocket(url);
                    this.url = url;

                    // Setup event handlers
                    this.ws.onopen = () => {
                        this.notifyHandlers({
                            type: 'connected',
                            data: { url: this.url },
                            timestamp: Date.now()
                        });
                        resolve(true);
                    };

                    this.ws.onmessage = (event) => {
                        this.notifyHandlers({
                            type: 'message',
                            data: event.data,
                            timestamp: Date.now()
                        });
                    };

                    this.ws.onerror = (error) => {
                        this.notifyHandlers({
                            type: 'error',
                            data: 'WebSocket error: ' + error.message,
                            timestamp: Date.now()
                        });
                        reject(error);
                    };

                    this.ws.onclose = () => {
                        this.notifyHandlers({
                            type: 'disconnected',
                            data: { url: this.url },
                            timestamp: Date.now()
                        });
                        this.ws = null;
                    };

                    // Connection timeout
                    setTimeout(() => {
                        if (this.ws?.readyState !== WebSocket.OPEN) {
                            reject(new Error('Connection timeout'));
                        }
                    }, 5000);

                } catch (error) {
                    reject(error);
                }
            });

        } catch (error) {
            this.notifyHandlers({
                type: 'error',
                data: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            });
            return false;
        }
    }

    // Disconnect from WebSocket
    public disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.url = '';
        }
    }

    // Send message
    public sendMessage(message: string): boolean {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(message);
                return true;
            } catch (error) {
                this.notifyHandlers({
                    type: 'error',
                    data: 'Failed to send message: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    timestamp: Date.now()
                });
                return false;
            }
        } else {
            this.notifyHandlers({
                type: 'error',
                data: 'Not connected to WebSocket',
                timestamp: Date.now()
            });
            return false;
        }
    }

    // Get connection status
    public getStatus(): string {
        if (!this.ws) {
            return 'Disconnected';
        }
        
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'Connecting...';
            case WebSocket.OPEN:
                return 'Connected';
            case WebSocket.CLOSING:
                return 'Closing...';
            case WebSocket.CLOSED:
                return 'Disconnected';
            default:
                return 'Unknown';
        }
    }

    // Check if connected
    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    // Get current URL
    public getCurrentUrl(): string {
        return this.url;
    }

    // Add message handler
    public addMessageHandler(handler: (data: MessageData) => void): void {
        this.messageHandlers.push(handler);
    }

    // Remove message handler
    public removeMessageHandler(handler: (data: MessageData) => void): void {
        const index = this.messageHandlers.indexOf(handler);
        if (index !== -1) {
            this.messageHandlers.splice(index, 1);
        }
    }

    // Notify all handlers
    private notifyHandlers(data: MessageData): void {
        this.messageHandlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error('Error in message handler:', error);
            }
        });
    }

    // Save URL to history
    private async saveUrlToHistory(url: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('wsClient');
        let history: string[] = config.get('urlHistory', []);
        
        // Remove if exists and add to beginning
        history = history.filter(u => u !== url);
        history.unshift(url);
        
        // Keep only last 10 URLs
        if (history.length > 10) {
            history = history.slice(0, 10);
        }
        
        await config.update('urlHistory', history, vscode.ConfigurationTarget.Global);
    }

    // Get URL history
    public getUrlHistory(): string[] {
        const config = vscode.workspace.getConfiguration('wsClient');
        return config.get('urlHistory', []);
    }

    // Static cleanup method
    public static cleanup(): void {
        if (WebSocketManager.instance) {
            WebSocketManager.instance.disconnect();
        }
    }
}