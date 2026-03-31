import * as vscode from 'vscode';
import { Collection, SavedRequest, RequestHeader } from './types';
import { STORAGE_KEY } from './config';


export class CollectionsManager {
  constructor(private readonly context: vscode.ExtensionContext) { }

  // ─── Read ────────────────────────────────────────────────────────────────

  getCollections(): Collection[] {
    return this.context.globalState.get<Collection[]>(STORAGE_KEY, []);
  }

  getCollection(id: string): Collection | undefined {
    return this.getCollections().find((c) => c.id === id);
  }

  // ─── Collections CRUD ────────────────────────────────────────────────────

  async createCollection(name: string, description?: string): Promise<Collection> {
    const collections = this.getCollections();
    const collection: Collection = {
      id: this.generateId(),
      name,
      description,
      requests: [],
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

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async save(collections: Collection[]): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, collections);
  }

  generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
