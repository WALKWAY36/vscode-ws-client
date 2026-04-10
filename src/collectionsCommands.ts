import * as vscode from 'vscode';
import { CollectionsManager } from './collectionsManager';
import { CollectionsProvider, CollectionItem, RequestItem } from './collectionsProvider';
import { RequestHeader } from './types';

const VALIDATE_NAME = (v: string) => (v.trim() ? undefined : 'Name cannot be empty');
export function registerCollectionCommands(
  context: vscode.ExtensionContext,
  manager: CollectionsManager,
  provider: CollectionsProvider,
  loadRequestInPanel: (url: string, message: string, headers: RequestHeader[]) => void
): vscode.Disposable[] {
  return [
    // ── New collection ───────────────────────────────────────────────────
    vscode.commands.registerCommand('ws-client.collections.new', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Collection name',
        placeHolder: 'e.g. Project Alpha',
        validateInput: VALIDATE_NAME,
      });
      if (!name) { return; }

      const description = await vscode.window.showInputBox({
        prompt: 'Description (optional)',
        placeHolder: 'Short description',
        validateInput: VALIDATE_NAME,
      });

      await manager.createCollection(name.trim(), description?.trim() || undefined);
      provider.refresh();
    }),

    // ── Rename collection ────────────────────────────────────────────────
    vscode.commands.registerCommand(
      'ws-client.collections.rename',
      async (item: CollectionItem) => {
        const newName = await vscode.window.showInputBox({
          prompt: 'New collection name',
          value: item.collection.name,
          validateInput: VALIDATE_NAME,
        });
        if (!newName) { return; }
        await manager.renameCollection(item.collection.id, newName.trim());
        provider.refresh();
      }
    ),

    // ── Delete collection ────────────────────────────────────────────────
    vscode.commands.registerCommand(
      'ws-client.collections.delete',
      async (item: CollectionItem) => {
        const answer = await vscode.window.showWarningMessage(
          `Delete collection "${item.collection.name}" and all incoming requests?`,
          { modal: true },
          'Delete'
        );
        if (answer !== 'Delete') { return; }
        await manager.deleteCollection(item.collection.id);
        provider.refresh();
      }
    ),

    // ── Save request (called from webview panel) ─────────────────────────
    vscode.commands.registerCommand(
      'ws-client.collections.saveRequest',
      async (payload: { url: string; message: string; headers: RequestHeader[] }) => {
        const collections = manager.getCollections();

        // Step 1: pick or create collection
        type CollectionQuickPickItem = vscode.QuickPickItem & { id?: string };
        const collectionItems: CollectionQuickPickItem[] = [
          { label: '$(add) New collection…', id: '__new__' },
          ...collections.map((c) => ({
            label: c.name,
            description: `${c.requests.length} request(s)`,
            id: c.id,
          })),
        ];

        const picked = await vscode.window.showQuickPick(collectionItems, {
          placeHolder: 'Save to collection…',
        });
        if (!picked) { return; }

        let collectionId = picked.id!;
        if (collectionId === '__new__') {
          const name = await vscode.window.showInputBox({
            prompt: 'New collection name',
            validateInput: VALIDATE_NAME,
          });
          if (!name) { return; }
          const col = await manager.createCollection(name.trim());
          collectionId = col.id;
        }

        // Step 2: request name
        const name = await vscode.window.showInputBox({
          prompt: 'Request name',
          placeHolder: 'e.g. Subscribe to channel',
          validateInput: VALIDATE_NAME,
        });
        if (!name) { return; }

        const description = await vscode.window.showInputBox({
          prompt: 'Description (optional)',
          placeHolder: 'What does this request do?',
        });

        await manager.addRequest(
          collectionId,
          name.trim(),
          payload.url,
          payload.message,
          payload.headers,
          description?.trim() || undefined
        );
        provider.refresh();
        vscode.window.showInformationMessage(`${EMODJI.SUCCESS} Request "${name}" saved.`);
      }
    ),

    // ── Load request into panel ──────────────────────────────────────────
    vscode.commands.registerCommand(
      'ws-client.collections.loadRequest',
      (item: RequestItem) => {
        loadRequestInPanel(item.request.url, item.request.message, item.request.headers);
      }
    ),

    // ── Edit request ─────────────────────────────────────────────────────
    vscode.commands.registerCommand(
      'ws-client.collections.editRequest',
      async (item: RequestItem) => {
        const name = await vscode.window.showInputBox({
          prompt: 'Request name',
          value: item.request.name,
          validateInput: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
        });
        if (!name) { return; }

        const description = await vscode.window.showInputBox({
          prompt: 'Description (optional)',
          value: item.request.description ?? '',
        });

        await manager.updateRequest(item.collectionId, item.request.id, {
          name: name.trim(),
          description: description?.trim() || undefined,
        });
        provider.refresh();
      }
    ),

    // ── Duplicate request ────────────────────────────────────────────────
    vscode.commands.registerCommand(
      'ws-client.collections.duplicateRequest',
      async (item: RequestItem) => {
        await manager.duplicateRequest(item.collectionId, item.request.id);
        provider.refresh();
      }
    ),

    // ── Delete request ───────────────────────────────────────────────────
    vscode.commands.registerCommand(
      'ws-client.collections.deleteRequest',
      async (item: RequestItem) => {
        const answer = await vscode.window.showWarningMessage(
          `Delete request "${item.request.name}"?`,
          { modal: true },
          'Delete'
        );
        if (answer !== 'Delete') { return; }
        await manager.deleteRequest(item.collectionId, item.request.id);
        provider.refresh();
      }
    ),

    // ── Refresh tree ─────────────────────────────────────────────────────
    vscode.commands.registerCommand('ws-client.collections.refresh', () => {
      provider.refresh();
    }),
  ];
}
