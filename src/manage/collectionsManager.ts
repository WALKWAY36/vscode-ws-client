import * as vscode from 'vscode';
import { Collection, SavedRequest, RequestHeader, TestCase, TestSuiteResult } from '../types';
import { STORAGE_KEY } from '../config';


export class CollectionsManager {
  constructor(private readonly context: vscode.ExtensionContext) { }


  // ─── Collections CRUD ────────────────────────────────────────────────────

  getCollection(id: string): Collection | undefined {
    return this.getCollections().find((c) => c.id === id);
  }

  getCollections(): Collection[] {
    const raw = this.context.globalState.get<Collection[]>(STORAGE_KEY, []);
    // migrate old collections that don't have testCases yet
    return raw.map((c) => ({ ...c, testCases: c.testCases ?? [] }));
  }

  async createCollection(name: string, description?: string): Promise<Collection> {
    const collections = this.getCollections();
    const collection: Collection = {
      id: this.generateId(),
      name,
      description,
      requests: [],
      testCases: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    collections.push(collection);
    await this.save(collections);
    return collection;
  }

  async renameCollection(id: string, newName: string): Promise<void> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === id);
    if (!col) { return; }
    col.name = newName;
    col.updatedAt = Date.now();
    await this.save(collections);
  }

  async deleteCollection(id: string): Promise<void> {
    const collections = this.getCollections().filter((c) => c.id !== id);
    await this.save(collections);
  }

  // ─── Requests CRUD ───────────────────────────────────────────────────────

  async addRequest(
    collectionId: string,
    name: string,
    url: string,
    message: string,
    headers: RequestHeader[],
    description?: string
  ): Promise<SavedRequest | undefined> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) { return undefined; }

    const request: SavedRequest = {
      id: this.generateId(),
      name,
      description,
      url,
      message,
      headers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    col.requests.push(request);
    col.updatedAt = Date.now();
    await this.save(collections);
    return request;
  }

  async updateRequest(
    collectionId: string,
    requestId: string,
    patch: Partial<Pick<SavedRequest, 'name' | 'description' | 'url' | 'message' | 'headers'>>
  ): Promise<void> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) { return; }
    const req = col.requests.find((r) => r.id === requestId);
    if (!req) { return; }
    Object.assign(req, patch, { updatedAt: Date.now() });
    col.updatedAt = Date.now();
    await this.save(collections);
  }

  async deleteRequest(collectionId: string, requestId: string): Promise<void> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) { return; }
    col.requests = col.requests.filter((r) => r.id !== requestId);
    col.updatedAt = Date.now();
    await this.save(collections);
  }

  async duplicateRequest(collectionId: string, requestId: string): Promise<void> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) { return; }
    const req = col.requests.find((r) => r.id === requestId);
    if (!req) { return; }
    const copy: SavedRequest = {
      ...req,
      id: this.generateId(),
      name: `${req.name} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    col.requests.push(copy);
    col.updatedAt = Date.now();
    await this.save(collections);
  }

  // ─── TestCase CRUD ───────────────────────────────────────────────────────

  async addTestCase(
    collectionId: string,
    data: Omit<TestCase, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<TestCase | undefined> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) { return undefined; }

    const testCase: TestCase = {
      ...data,
      id: this.generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    col.testCases.push(testCase);
    col.updatedAt = Date.now();
    await this.save(collections);
    return testCase;
  }

  async updateTestCase(
    collectionId: string,
    testCaseId: string,
    patch: Partial<Omit<TestCase, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) { return; }
    const tc = col.testCases.find((t) => t.id === testCaseId);
    if (!tc) { return; }
    Object.assign(tc, patch, { updatedAt: Date.now() });
    col.updatedAt = Date.now();
    await this.save(collections);
  }

  async deleteTestCase(collectionId: string, testCaseId: string): Promise<void> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) { return; }
    col.testCases = col.testCases.filter((t) => t.id !== testCaseId);
    col.updatedAt = Date.now();
    await this.save(collections);
  }

  async duplicateTestCase(collectionId: string, testCaseId: string): Promise<void> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) { return; }
    const tc = col.testCases.find((t) => t.id === testCaseId);
    if (!tc) { return; }
    const copy: TestCase = {
      ...tc,
      id: this.generateId(),
      name: `${tc.name} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    col.testCases.push(copy);
    col.updatedAt = Date.now();
    await this.save(collections);
  }

  /** Persist the result of the last test suite run */
  async saveTestSuiteResult(collectionId: string, result: TestSuiteResult): Promise<void> {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (!col) { return; }
    col.lastTestResult = result;
    await this.save(collections);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async save(collections: Collection[]): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, collections);
  }

  generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
