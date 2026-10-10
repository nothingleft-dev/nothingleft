'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CSV_IMPORT_MAX_BYTES, type ImportJob, type ImportMapping, type ImportStatus } from '@nothingleft/types';
import { formatBytes } from '@nothingleft/format';
import { completeImport, createImport, dryRunImport, getImport, listImports, startImport } from '@lib/api/imports';
import { putUpload } from '@lib/api/storage';
import { sha256Base64 } from '@lib/files';
import { invalidateAgile } from '@lib/query/agile';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

const RUNNING: readonly ImportStatus[] = ['queued', 'running'];

export const isImportRunning = (job: Pick<ImportJob, 'status'>) => RUNNING.includes(job.status);

export function useImports(project: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.imports(project),
    queryFn: () => listImports(project).then(r => r.data),
    refetchInterval: query => (query.state.data?.some(isImportRunning) ? POLL.job(query) : POLL.admin(query)),
    enabled,
  });
}

export function useImport(project: string, id: number | null) {
  return useQuery({
    queryKey: queryKeys.importJob(project, id),
    queryFn: () => getImport(project, id as number).then(r => r.data),
    refetchInterval: query => (query.state.data && isImportRunning(query.state.data) ? POLL.job(query) : false),
    enabled: id !== null,
  });
}

export class ImportTooLargeError extends Error {
  override readonly name = 'ImportTooLargeError';

  constructor(filename: string) {
    super(`${filename} is larger than ${formatBytes(CSV_IMPORT_MAX_BYTES)}. Split it into smaller files.`);
  }
}

export type UploadPhase = 'hashing' | 'uploading' | 'reading';

interface UploadVariables {
  file: File;
  onPhase: (phase: UploadPhase) => void;
  onProgress: (loaded: number, total: number) => void;
  signal: AbortSignal;
}

/** Reserve, PUT, then have the server read the header row and the first rows. */
export function useUploadImport(project: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, onPhase, onProgress, signal }: UploadVariables) => {
      if (file.size > CSV_IMPORT_MAX_BYTES) throw new ImportTooLargeError(file.name);
      onPhase('hashing');
      const sha256 = await sha256Base64(file);
      const reserved = (await createImport(project, { filename: file.name, size: file.size, sha256 })).data;
      onPhase('uploading');
      await putUpload(reserved.upload_url, file, { headers: reserved.upload_headers, onProgress, signal });
      onPhase('reading');
      return (await completeImport(project, reserved.job.id)).data;
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.imports(project) }),
  });
}

/** An upload left unstarted: read again for its columns and first rows. */
export function useReadImport(project: string) {
  return useMutation({ mutationFn: (id: number) => completeImport(project, id).then(r => r.data) });
}

export function useDryRunImport(project: string) {
  return useMutation({
    mutationFn: ({ id, mapping }: { id: number; mapping: ImportMapping }) =>
      dryRunImport(project, id, { column_mapping: mapping }).then(r => r.data),
  });
}

export function useStartImport(project: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mapping }: { id: number; mapping: ImportMapping }) =>
      startImport(project, id, { column_mapping: mapping }).then(r => r.data),
    onSuccess: job => client.setQueryData(queryKeys.importJob(project, job.id), job),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.imports(project) }),
  });
}

/** The issues an import created belong in every list, figure, backlog and tag count once it is done. */
export function useRefreshAfterImport() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['issues'] });
    void client.invalidateQueries({ queryKey: ['tags'] });
    invalidateAgile(client);
  };
}
