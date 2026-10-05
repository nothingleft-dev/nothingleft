'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkUpdateIssues, Issue, IssueListItem, UpdateIssue } from '@nothingleft/types';
import { updateIssue } from '@lib/api/issues';
import {
  bulkUpdateIssues,
  clearRecentSearches,
  downloadIssuesCsv,
  getIssueFigures,
  searchIssues,
  suggestQuery,
  type IssueCsvQuery,
  type IssueFiguresQuery,
  type IssueSearchQuery,
  type SuggestKind,
} from '@lib/api/search';
import { saveDownload } from '@lib/files';
import { isApiError } from '@lib/api/errors';
import { invalidateAgile } from '@lib/query/agile';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export const SEARCH_PAGE_SIZE = 200;

type SearchPage = Awaited<ReturnType<typeof searchIssues>>;

// A query error is the user's to fix, not a transient fault: retrying it would only repeat the message.
const retryUnlessQueryError = (count: number, error: unknown) =>
  count < 1 && !(isApiError(error) && error.status === 400);

/** Every page of one search; `meta.groups` and the total come from the first page. */
export function useIssueSearch(query: Omit<IssueSearchQuery, 'offset' | 'limit'>, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.issueSearch(query),
    refetchInterval: POLL.list,
    queryFn: ({ pageParam, signal }) => searchIssues({ ...query, limit: SEARCH_PAGE_SIZE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last: SearchPage, pages) =>
      last.meta.pagination?.has_more ? pages.length * SEARCH_PAGE_SIZE : undefined,
    enabled,
    retry: retryUnlessQueryError,
    placeholderData: previous => previous,
  });
}

/** A short list for a dashboard section: the first `limit` rows only. */
export function useIssueSlice(query: Omit<IssueSearchQuery, 'offset'>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.issueSearch(query),
    refetchInterval: POLL.list,
    queryFn: ({ signal }) => searchIssues(query, signal),
    enabled,
    retry: retryUnlessQueryError,
  });
}

/** How many issues a query matches, for a view tab or a sidebar count. */
export function useIssueCount(q: string, project?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.issueCount(q, project),
    refetchInterval: POLL.list,
    queryFn: ({ signal }) =>
      searchIssues({ q, project, limit: 1 }, signal).then(r => r.meta.pagination?.total ?? r.data.length),
    enabled,
    staleTime: 60_000,
    retry: retryUnlessQueryError,
  });
}

export function useIssueFigures(query: IssueFiguresQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.issueFigures(query),
    refetchInterval: POLL.figures,
    queryFn: () => getIssueFigures(query).then(r => r.data),
    enabled,
    staleTime: 60_000,
    retry: retryUnlessQueryError,
  });
}

export function useSuggestions(q: string, caret: number, enabled: boolean, kind: SuggestKind = 'issues') {
  return useQuery({
    queryKey: queryKeys.suggest(q, caret, kind),
    queryFn: ({ signal }) => suggestQuery(q, caret, kind, signal).then(r => r.data),
    enabled,
    staleTime: 30_000,
    placeholderData: previous => previous,
  });
}

export function useClearRecentSearches() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => clearRecentSearches().then(r => r.data),
    onSettled: () => void client.invalidateQueries({ queryKey: ['search', 'suggest'] }),
  });
}

function patchListedIssue(pages: SearchPage[] | undefined, key: string, patch: (issue: IssueListItem) => Issue) {
  if (!pages) return pages;
  return pages.map(page => ({
    ...page,
    data: page.data.map(row => (row.key === key ? { ...row, ...patch(row) } : row)),
  }));
}

/**
 * An inline edit from a list row. The row changes at once in every search on screen; the
 * server's answer replaces it, a refusal rolls it back.
 */
export function useUpdateListedIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: UpdateIssue; optimistic?: (issue: IssueListItem) => Issue }) =>
      updateIssue(key, body).then(r => r.data),
    onMutate: async ({ key, optimistic }) => {
      await client.cancelQueries({ queryKey: queryKeys.issueSearches() });
      const snapshot = client.getQueriesData<{ pages: SearchPage[] }>({ queryKey: queryKeys.issueSearches() });
      if (optimistic) {
        for (const [queryKey, data] of snapshot) {
          if (data && typeof data === 'object' && 'pages' in data) {
            client.setQueryData(queryKey, { ...data, pages: patchListedIssue(data.pages, key, optimistic) });
          }
        }
      }
      return { snapshot };
    },
    onError: (_error, _input, context) => {
      for (const [queryKey, data] of context?.snapshot ?? []) client.setQueryData(queryKey, data);
    },
    onSuccess: issue => {
      client.setQueryData(queryKeys.issue(issue.key), issue);
      for (const [queryKey, data] of client.getQueriesData<{ pages: SearchPage[] }>({
        queryKey: queryKeys.issueSearches(),
      })) {
        if (data && typeof data === 'object' && 'pages' in data) {
          client.setQueryData(queryKey, { ...data, pages: patchListedIssue(data.pages, issue.key, () => issue) });
        }
      }
    },
    onSettled: () => invalidateIssueLists(client),
  });
}

export function useBulkUpdateIssues() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkUpdateIssues) => bulkUpdateIssues(body).then(r => r.data),
    onSettled: () => invalidateIssueLists(client),
  });
}

/** Lists, their counts and the dashboard figures all derive from the same issues. */
function invalidateIssueLists(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: queryKeys.issueSearches() });
  void client.invalidateQueries({ queryKey: queryKeys.issueCounts() });
  void client.invalidateQueries({ queryKey: ['issues', 'figures'] });
  invalidateAgile(client);
}

export function useIssuesCsvExport() {
  return useMutation({
    mutationFn: (query: IssueCsvQuery) => downloadIssuesCsv(query),
    onSuccess: saveDownload,
  });
}
