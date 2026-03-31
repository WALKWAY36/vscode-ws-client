export interface RequestHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface SavedRequest {
  id: string;
  name: string;
  description?: string;
  url: string;
  message: string;
  headers: RequestHeader[];
  createdAt: number;
  updatedAt: number;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  requests: SavedRequest[];
  createdAt: number;
  updatedAt: number;
}
