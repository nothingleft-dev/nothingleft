import type {
  BulkUpdateIssues,
  BulkUpdateResult,
  ClearedRecentSearches,
  IssueCsvColumnInput,
  IssueFigures,
  IssueGroupBy,
  IssueListItem,
  Suggestion,
} from '@nothingleft/types';
import { api } from '@lib/api/client';
import { downloadCsv } from '@lib/api/csv';

export interface IssueSearchQuery {
  q?: string;
  project?: string;
  group_by?: IssueGroupBy;
  group_limit?: number;
  sort?: string;
  limit?: number;
  offset?: number;
}

export const searchIssues = (query: IssueSearchQuery, signal?: AbortSignal) =>
  api.get<IssueListItem[]>('/v1/issues', {
    query: {
      q: query.q || undefined,
      project: query.project,
      group_by: query.group_by,
      group_limit: query.group_limit,
      sort: query.sort || undefined,
      limit: query.limit,
      offset: query.offset,
    },
    signal,
  });

export type SuggestKind = 'issues' | 'articles';

export const suggestQuery = (q: string, caret: number, kind: SuggestKind, signal?: AbortSignal) =>
  api.get<Suggestion[]>('/v1/search/suggest', {
    query: { q, caret, kind: kind === 'issues' ? undefined : kind },
    signal,
  });

export const clearRecentSearches = () => api.delete<ClearedRecentSearches>('/v1/search/recent');

export const bulkUpdateIssues = (body: BulkUpdateIssues) =>
  api.post<BulkUpdateResult[]>('/v1/issues/bulk-update', { body });

export interface IssueFiguresQuery {
  q?: string;
  project?: string;
  per?: 'project';
}

export const getIssueFigures = (query: IssueFiguresQuery) =>
  api.get<IssueFigures[]>('/v1/issues/figures', {
    query: { q: query.q || undefined, project: query.project, per: query.per },
  });

export interface IssueCsvQuery {
  q?: string;
  project?: string;
  sort?: string;
  columns?: readonly IssueCsvColumnInput[];
}

export const downloadIssuesCsv = (query: IssueCsvQuery) =>
  downloadCsv(
    '/v1/issues/export.csv',
    {
      q: query.q || undefined,
      project: query.project,
      sort: query.sort || undefined,
      columns: query.columns?.join(','),
    },
    'issues.csv',
  );
