'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import {
  BYO_CHECK_OBJECT_BYTES,
  STORAGE_CRITICAL_PERCENT,
  STORAGE_WARNING_PERCENT,
  type ConnectStorage,
  type Organization,
  type StepUp,
  type StorageConnection,
  type StorageFile,
  type StorageLevel,
  type StorageOverview,
  type SuccessEnvelope,
} from '@nothingleft/types';
import { deleteAttachment } from '@lib/api/attachments';
import {
  connectStorage,
  disconnectStorage,
  getStorageOverview,
  listStorageFiles,
  startBrowserCheck,
  startMigration,
  verifyStorage,
  type StorageFilesFilter,
} from '@lib/api/organization-storage';
import { getCheckObject, putCheckObject } from '@lib/api/storage';
import { sha256Base64 } from '@lib/files';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export const STORAGE_FILES_PAGE = 50;

export function useStorageOverview(slug: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.storageOverview(slug),
    queryFn: () => getStorageOverview(slug).then(r => r.data),
    refetchInterval: query =>
      query.state.data?.connection?.migration.state === 'running' ? POLL.progress(query) : POLL.admin(query),
    enabled,
  });
}

export function useStorageFiles(slug: string, filter: StorageFilesFilter, enabled = true) {
  const query = { ...filter, limit: STORAGE_FILES_PAGE };
  return useQuery({
    queryKey: queryKeys.storageFiles(slug, query),
    queryFn: () => listStorageFiles(slug, query),
    refetchInterval: POLL.admin,
    placeholderData: previous => previous,
    enabled,
  });
}

function levelOf(used: number, limit: number): StorageLevel {
  const percent = (used / limit) * 100;
  return percent >= 100
    ? 'full'
    : percent >= STORAGE_CRITICAL_PERCENT
      ? 'critical'
      : percent >= STORAGE_WARNING_PERCENT
        ? 'warning'
        : 'ok';
}

type Snapshot = [QueryKey, unknown][];

function snapshot(client: QueryClient, keys: readonly QueryKey[]): Snapshot {
  return keys.flatMap(queryKey => client.getQueriesData({ queryKey }));
}

function restore(client: QueryClient, previous: Snapshot | undefined) {
  for (const [key, data] of previous ?? []) client.setQueryData(key, data);
}

export function useDeleteStorageFile(slug: string) {
  const client = useQueryClient();
  const files = queryKeys.storageFiles(slug).slice(0, 4);
  const overview = queryKeys.storageOverview(slug);
  const organization = queryKeys.organization(slug);

  return useMutation({
    mutationFn: (file: StorageFile) => deleteAttachment(file.id).then(r => r.data),
    onMutate: async file => {
      await Promise.all([files, overview].map(queryKey => client.cancelQueries({ queryKey })));
      const previous = snapshot(client, [files, overview, organization]);
      const size = file.size_bytes;
      const platform = file.storage_target === 'platform';

      client.setQueriesData<SuccessEnvelope<StorageFile[]>>({ queryKey: files }, page => {
        if (!page?.data.some(f => f.id === file.id)) return page;
        const pagination = page.meta.pagination;
        return {
          ...page,
          data: page.data.filter(f => f.id !== file.id),
          meta: pagination ? { ...page.meta, pagination: { ...pagination, total: pagination.total - 1 } } : page.meta,
        };
      });
      client.setQueryData<StorageOverview>(overview, o => {
        if (!o) return o;
        const less = (t: { files: number; bytes: number }) => ({
          files: Math.max(0, t.files - 1),
          bytes: Math.max(0, t.bytes - size),
        });
        if (!platform) return { ...o, bring_your_own: less(o.bring_your_own) };
        const next = { ...o.platform, ...less(o.platform) };
        const verified = o.connection?.status === 'verified';
        return { ...o, platform: { ...next, level: verified ? 'ok' : levelOf(next.bytes, next.limit_bytes) } };
      });
      if (platform) {
        client.setQueryData<Organization>(organization, org => {
          if (!org) return org;
          const used = Math.max(0, org.storage.used_bytes - size);
          const level = org.storage.bring_your_own === 'verified' ? 'ok' : levelOf(used, org.storage.limit_bytes);
          return { ...org, storage: { ...org.storage, used_bytes: used, level } };
        });
      }
      return { previous };
    },
    onError: (_error, _file, context) => restore(client, context?.previous),
    onSettled: (_data, _error, file) => {
      void client.invalidateQueries({ queryKey: queryKeys.storage(slug) });
      void client.invalidateQueries({ queryKey: organization, exact: true });
      if (file.issue) void client.invalidateQueries({ queryKey: queryKeys.issueAttachments(file.issue) });
      if (file.article) {
        void client.invalidateQueries({ queryKey: queryKeys.articleAttachments(file.project, file.article.slug) });
      }
    },
  });
}

function useStoreConnection(slug: string) {
  const client = useQueryClient();
  return (connection: StorageConnection) =>
    client.setQueryData<StorageOverview>(queryKeys.storageOverview(slug), o => (o ? { ...o, connection } : o));
}

function useRefreshStorage(slug: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.storage(slug) });
    void client.invalidateQueries({ queryKey: queryKeys.organization(slug), exact: true });
  };
}

/**
 * Saves the connection after the server's own round trip. A new bucket comes back `pending`, for the
 * browser check; a new key for the same bucket comes back `verified`. A refused new bucket is saved as
 * `failed`, so settling refetches it either way.
 */
export function useConnectStorage(slug: string) {
  const store = useStoreConnection(slug);
  const refresh = useRefreshStorage(slug);
  return useMutation({
    mutationFn: (body: ConnectStorage) => connectStorage(slug, body).then(r => r.data),
    onSuccess: store,
    onSettled: refresh,
  });
}

export type BrowserCheckStep = 'upload' | 'download' | 'verify';

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export class BrowserCheckMismatchError extends Error {
  override readonly name = 'BrowserCheckMismatchError';

  constructor() {
    super(
      'The file this browser read back is not the one it uploaded. Check the bucket has no rule that changes objects.',
    );
  }
}

/** Uploads 8 KB of random bytes from this browser, opens them again, then asks the server to confirm and switch over. */
export function useBrowserCheck(slug: string) {
  const store = useStoreConnection(slug);
  const refresh = useRefreshStorage(slug);
  return useMutation({
    mutationFn: async (onStep: (step: BrowserCheckStep) => void) => {
      const bytes = crypto.getRandomValues(new Uint8Array(BYO_CHECK_OBJECT_BYTES));
      const sha256 = await sha256Base64(new Blob([bytes]));
      onStep('upload');
      const check = (await startBrowserCheck(slug, { size: BYO_CHECK_OBJECT_BYTES, sha256 })).data;
      await putCheckObject(check.upload_url, check.upload_headers, bytes);
      onStep('download');
      const back = await getCheckObject(check.download_url);
      if (!sameBytes(back, bytes)) throw new BrowserCheckMismatchError();
      onStep('verify');
      return (await verifyStorage(slug, { check_id: check.check_id, sha256 })).data;
    },
    onSuccess: store,
    onSettled: refresh,
  });
}

export function useStartMigration(slug: string) {
  const client = useQueryClient();
  const store = useStoreConnection(slug);
  const refresh = useRefreshStorage(slug);
  const key = queryKeys.storageOverview(slug);
  return useMutation({
    mutationFn: () => startMigration(slug).then(r => r.data),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<StorageOverview>(key);
      if (previous?.connection) {
        const { migration } = previous.connection;
        store({
          ...previous.connection,
          migration: { ...migration, state: 'running', stalled: false, error: null, finished_at: null },
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: store,
    onSettled: refresh,
  });
}

export function useDisconnectStorage(slug: string) {
  const client = useQueryClient();
  const refresh = useRefreshStorage(slug);
  return useMutation({
    mutationFn: (body: StepUp) => disconnectStorage(slug, body).then(r => r.data),
    onSuccess: overview => client.setQueryData(queryKeys.storageOverview(slug), overview),
    onSettled: refresh,
  });
}
