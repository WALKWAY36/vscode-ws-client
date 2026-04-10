import * as vscode from 'vscode';
import { CollectionsManager } from './manage/collectionsManager';
import { Collection, SavedRequest, TestCase } from './types';
import { EMODJI } from './config';

// ─── Tree item types ──────────────────────────────────────────────────────────

export class CollectionItem extends vscode.TreeItem {
  constructor(public readonly collection: Collection) {
    super(collection.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'collection';
    this.iconPath = new vscode.ThemeIcon('folder');

    const r = collection.lastTestResult;
    if (r) {
      const icon = r.failedCount === 0 ? EMODJI.SUCCESS : EMODJI.FAILURE;
      this.description = `${icon} ${r.passedCount}/${r.totalCount}`;
    } else {
      this.description = `${collection.requests.length} req · ${collection.testCases.length} tests`;
    }

    this.tooltip = [
      collection.name,
      collection.description,
      `Requests: ${collection.requests.length}`,
      `Test cases: ${collection.testCases.length}`,
    ].filter(Boolean).join('\n');
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

export class TestSuiteItem extends vscode.TreeItem {
  constructor(public readonly collection: Collection) {
    super('Tests', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'testSuite';
    this.iconPath = new vscode.ThemeIcon('beaker');

    const r = collection.lastTestResult;
    if (r) {
      const icon = r.failedCount === 0 ? EMODJI.SUCCESS : EMODJI.FAILURE;
      this.description = `${icon} ${r.passedCount}/${r.totalCount}`;
    } else {
      this.description = `${collection.testCases.length} case${collection.testCases.length !== 1 ? 's' : ''}`;
    }
    this.tooltip = 'Test cases for this collection';
  }
}

export class TestCaseItem extends vscode.TreeItem {
  constructor(
    public readonly testCase: TestCase,
    public readonly collectionId: string,
    public readonly lastPassed?: boolean
  ) {
    super(testCase.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'testCase';

    const statusIcon =
      !testCase.enabled       ? EMODJI.DISABLE :
      lastPassed === true     ? EMODJI.SUCCESS :
      lastPassed === false    ? EMODJI.FAILURE :
                                EMODJI.DISABLE;

    this.iconPath = new vscode.ThemeIcon(
      !testCase.enabled    ? 'circle-slash' :
      lastPassed === true  ? 'pass'         :
      lastPassed === false ? 'error'        :
                             'circle-outline'
    );

    this.description = testCase.enabled ? undefined : '(disabled)';
    this.tooltip = [
      testCase.name,
      testCase.description,
      `Assertion: ${testCase.assertion}`,
      testCase.enabled ? '' : '— disabled',
    ].filter(Boolean).join('\n');
  }
}

export type CollectionTreeItem = CollectionItem | RequestItem | TestSuiteItem | TestCaseItem;

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
      const col = element.collection;
      const children: CollectionTreeItem[] = [];

      // Requests group
      for (const r of col.requests) {
        children.push(new RequestItem(r, col.id));
      }

      // Test suite node
      children.push(new TestSuiteItem(col));
      return children;
    }

    if (element instanceof TestSuiteItem) {
      const col = element.collection;
      return col.testCases.map((tc) => {
        const lastResult = col.lastTestResult?.results.find((r) => r.testCaseId === tc.id);
        return new TestCaseItem(
          tc,
          col.id,
          lastResult ? lastResult.passed : undefined
        );
      });
    }

    return [];
  }
}
