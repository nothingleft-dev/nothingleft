import type {
  CreateIssue,
  Issue,
  IssueActivity,
  IssueActivityKind,
  IssueRef,
  IssueWatcher,
  ToggleTask,
  UpdateIssue,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const base = (key: string) => `/v1/issues/${encodeURIComponent(key)}`;

export interface IssueListQuery {
  project: string;
  deleted?: boolean;
  limit?: number;
  offset?: number;
}

export type IssueSignal = 'star' | 'vote' | 'watch';

export const listIssues = (query: IssueListQuery) =>
  api.get<Issue[]>('/v1/issues', {
    query: { project: query.project, deleted: query.deleted, limit: query.limit, offset: query.offset },
  });

export const getIssue = (key: string) => api.get<Issue>(base(key));

export const createIssue = (body: CreateIssue, idempotencyKey?: string) =>
  api.post<Issue>('/v1/issues', { body, idempotencyKey });

export const updateIssue = (key: string, body: UpdateIssue) => api.patch<Issue>(base(key), { body });

export const deleteIssue = (key: string) => api.delete<Issue>(base(key));

export const restoreIssue = (key: string) => api.post<Issue>(`${base(key)}/restore`);

export const setIssueSignal = (key: string, signal: IssueSignal, on: boolean) =>
  on ? api.put<Issue>(`${base(key)}/${signal}`) : api.delete<Issue>(`${base(key)}/${signal}`);

export const listIssueWatchers = (key: string) => api.get<IssueWatcher[]>(`${base(key)}/watchers`);

export const listIssueActivity = (key: string, cursor?: string, kinds?: readonly IssueActivityKind[]) =>
  api.get<IssueActivity[]>(`${base(key)}/activity`, { query: { cursor, limit: 100, kind: kinds } });

export const toggleIssueTask = (key: string, body: ToggleTask) =>
  api.post<Issue>(`${base(key)}/tasks/toggle`, { body });

export const getIssueRefs = (keys: readonly string[]) =>
  api.get<IssueRef[]>('/v1/issues/refs', { query: { keys: keys.join(',') } });

export const searchIssueRefs = (q: string, project?: string, limit?: number) =>
  api.get<IssueRef[]>('/v1/issues/refs', { query: { q, project, limit } });
