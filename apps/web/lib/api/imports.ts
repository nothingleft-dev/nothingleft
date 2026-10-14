import type { CreateImport, ImportDryRun, ImportJob, ImportPreview, ImportUpload, RunImport } from '@nothingleft/types';
import { api } from '@lib/api/client';

const imports = (key: string) => `/v1/projects/${encodeURIComponent(key)}/imports`;

// The server reads the whole file before answering; 50 MB takes longer than the usual ten seconds.
const READ_TIMEOUT_MS = 120_000;

export const listImports = (key: string) => api.get<ImportJob[]>(imports(key));

export const getImport = (key: string, id: number) => api.get<ImportJob>(`${imports(key)}/${id}`);

export const createImport = (key: string, body: CreateImport) => api.post<ImportUpload>(imports(key), { body });

export const completeImport = (key: string, id: number) =>
  api.post<ImportPreview>(`${imports(key)}/${id}/complete`, { timeoutMs: READ_TIMEOUT_MS });

export const dryRunImport = (key: string, id: number, body: RunImport) =>
  api.post<ImportDryRun>(`${imports(key)}/${id}/dry-run`, { body, timeoutMs: READ_TIMEOUT_MS });

export const startImport = (key: string, id: number, body: RunImport) =>
  api.post<ImportJob>(`${imports(key)}/${id}/start`, { body });
