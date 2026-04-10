import * as vscode from 'vscode';
import { CollectionsManager } from './collectionsManager';
import { Collection, SavedRequest } from './types';

// ─── Tree item types ──────────────────────────────────────────────────────────

export class CollectionItem extends vscode.TreeItem {
  constructor(public readonly collection: Collection) {
    super(collection.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'collection';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.tooltip = collection.description
      ? `${collection.name}\n${collection.description}`
      : collection.name;
    this.description = `${collection.requests.length} request${collection.requests.length !== 1 ? 's' : ''}`;
  }
}

export class RequestItem extends vscode.TreeItem {
  constructor(
    public readonly request: SavedRequest,
    public readonly collectionId: string
  ) {
    super(request.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'savedRequest';
    this.iconPath = new vscode.ThemeIcon('arrow-right');
    this.description = request.url;
    this.tooltip = [
      request.name,
      request.description ? `📝 ${request.description}` : '',
      `${EMODJI.URL} ${request.url}`,
      request.message ? `${EMODJI.REQUEST} ${request.message.slice(0, 60)}${request.message.length > 60 ? '…' : ''}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Double-click loads the request into the panel
    this.command = {
      command: 'ws-client.collections.loadRequest',
      title: 'Load Request',
      arguments: [this],
    };
  }
}

export type CollectionTreeItem = CollectionItem | RequestItem;

// ─── Provider ────────────────────────────────────────────────────────────────

export class CollectionsProvider
  implements vscode.TreeDataProvider<CollectionTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    CollectionTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly manager: CollectionsManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CollectionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CollectionTreeItem): CollectionTreeItem[] {
    if (!element) {
      // Root: return all collections
      return this.manager.getCollections().map((c) => new CollectionItem(c));
    }

    if (element instanceof CollectionItem) {
      return element.collection.requests.map(
        (r) => new RequestItem(r, element.collection.id)
      );
    }

    return [];
  }
}
