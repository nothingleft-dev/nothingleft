import type { CreateWorkItems, MemberRef, UpdateWorkItem, WorkItem } from '@nothingleft/types';
import { api } from '@lib/api/client';

const base = (key: string) => `/v1/issues/${encodeURIComponent(key)}/work-items`;

export const listWorkItems = (key: string, subtasks: boolean, cursor?: string) =>
  api.get<WorkItem[]>(base(key), { query: { cursor, limit: 100, include: subtasks ? 'subtasks' : undefined } });

export const createWorkItems = (key: string, body: CreateWorkItems, idempotencyKey?: string) =>
  api.post<WorkItem[]>(base(key), { body, idempotencyKey });

export const updateWorkItem = (key: string, id: number, body: UpdateWorkItem) =>
  api.patch<WorkItem>(`${base(key)}/${id}`, { body });

export const deleteWorkItem = (key: string, id: number) => api.delete<WorkItem>(`${base(key)}/${id}`);

export const listWorkAuthors = (projectKey: string) =>
  api.get<MemberRef[]>(`/v1/projects/${encodeURIComponent(projectKey)}/work-authors`);
