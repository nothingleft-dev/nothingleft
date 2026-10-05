import type {
  ConnectStorage,
  DisconnectStorage,
  StorageBrowserCheck,
  StorageBrowserCheckInput,
  StorageConnection,
  StorageFile,
  StorageFilesQuery,
  StorageOverview,
  VerifyStorage,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const storage = (slug: string) => `/v1/organizations/${encodeURIComponent(slug)}/storage`;

// The server writes, reads and deletes in the customer's bucket before answering; a slow
// provider can take longer than the client's usual ten seconds.
const CHECK_TIMEOUT_MS = 90_000;

export type StorageFilesFilter = Partial<Pick<StorageFilesQuery, 'sort' | 'target' | 'project'>> & {
  offset?: number;
  limit?: number;
};

export const getStorageOverview = (slug: string) => api.get<StorageOverview>(storage(slug));

export const listStorageFiles = (slug: string, query: StorageFilesFilter) =>
  api.get<StorageFile[]>(`${storage(slug)}/files`, { query });

export const connectStorage = (slug: string, body: ConnectStorage) =>
  api.put<StorageConnection>(`${storage(slug)}/connection`, { body, timeoutMs: CHECK_TIMEOUT_MS });

export const startBrowserCheck = (slug: string, body: StorageBrowserCheckInput) =>
  api.post<StorageBrowserCheck>(`${storage(slug)}/connection/browser-check`, { body });

export const verifyStorage = (slug: string, body: VerifyStorage) =>
  api.post<StorageConnection>(`${storage(slug)}/connection/verify`, { body, timeoutMs: CHECK_TIMEOUT_MS });

export const disconnectStorage = (slug: string, body: DisconnectStorage) =>
  api.delete<StorageOverview>(`${storage(slug)}/connection`, { body });

export const startMigration = (slug: string) => api.post<StorageConnection>(`${storage(slug)}/migration`);
