# WebSocket Client for VSCode

[![Version](https://img.shields.io/visual-studio-marketplace/v/walkway36.vscode-ws-client)](https://marketplace.visualstudio.com/items?itemName=walkway36.vscode-ws-client)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/walkway36.vscode-ws-client)](https://marketplace.visualstudio.com/items?itemName=walkway36.vscode-ws-client)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/walkway36.vscode-ws-client)](https://marketplace.visualstudio.com/items?itemName=walkway36.vscode-ws-client)

A professional WebSocket client for testing and debugging WebSocket connections directly in VSCode.

## Features

- 🔌 Connect to any WebSocket server (ws:// or wss://)
- 📨 Send and receive messages in real-time
- 📜 Message history with timestamps
- 🔄 Auto-reconnect capability
- 📋 URL history with quick access
- 🎨 Clean and intuitive interface
- 🌓 Supports VSCode light/dark themes
- ⌨️ Keyboard shortcuts for quick access

## Installation

Install through VSCode extensions marketplace:
1. Open VSCode
2. Press `Ctrl+Shift+X` (Cmd+Shift+X on Mac)
3. Search for "WebSocket Client"
4. Click Install

Or install from command line:

```bash
code --install-extension walkway36.vscode-ws-client
```

## Usage

1. Press Ctrl+Shift+W (Cmd+Shift+W on Mac) to open the WebSocket client
2. Enter a WebSocket URL (e.g., ws://echo.websocket.org or wss://echo.websocket.org)
3. Click "Connect" or press Enter
4. Send messages and view responses in real-time

## Keyboard Shortcuts

- Ctrl+Shift+W (Cmd+Shift+W on Mac) - Open WebSocket client
- Ctrl+Enter in message field - Send message
- Enter in URL field - Connect

## Example Servers for Testing

- ws://echo.websocket.org - Echo server
- ws://localhost:8080/echo - Your local echo server
- wss://echo.websocket.org - Secure echo server

## Requirements

- VSCode 1.85.0 or higher

## Extension Settings

This extension contributes the following settings:
- wsClient.urlHistory: History of WebSocket URLs (automatically maintained)

## Known Issues

See GitHub Issues

## Release Notes

### 1.0.0

Initial release:
- Basic WebSocket connection functionality
- Message sending/receiving
- URL history
- Keyboard shortcuts
- Theme support

## Contributing

Contributions are welcome! Please read our Contributing Guide.

## License
MIT

### Enjoy! 🚀


