'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type { CreateWorkItems, Issue, SuccessEnvelope, UpdateWorkItem, WorkItem } from '@nothingleft/types';
import { createWorkItems, deleteWorkItem, listWorkAuthors, listWorkItems, updateWorkItem } from '@lib/api/work-items';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

type Pages = InfiniteData<SuccessEnvelope<WorkItem[]>, string | undefined>;

export function useWorkItems(key: string, subtasks: boolean, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.issueWorkItems(key, subtasks),
    refetchInterval: POLL.list,
    queryFn: ({ pageParam }) => listWorkItems(key, subtasks, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.meta.pagination?.next_cursor ?? undefined,
    enabled,
  });
}

export function useWorkAuthors(projectKey: string | null) {
  return useQuery({
    queryKey: queryKeys.projectWorkAuthors(projectKey ?? ''),
    queryFn: () => listWorkAuthors(projectKey as string).then(r => r.data),
    enabled: projectKey !== null,
    staleTime: 5 * 60_000,
  });
}

// A record changes the spent time of its issue and every ancestor, and shows in each one's subtree list.
function settle(client: QueryClient, key: string) {
  void client.invalidateQueries({
    predicate: ({ queryKey }) => queryKey[0] === 'issues' && (queryKey.length === 2 || queryKey[2] === 'work-items'),
  });
  void client.invalidateQueries({ queryKey: queryKeys.issueActivity(key) });
  void client.invalidateQueries({ queryKey: queryKeys.issueSearches() });
  // A deleted record takes its files with it; a new one may have claimed drafts.
  void client.invalidateQueries({ queryKey: queryKeys.issueAttachments(key) });
}

export function useLogTime(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateWorkItems; idempotencyKey: string }) =>
      createWorkItems(key, body, idempotencyKey).then(r => r.data),
    onSettled: () => settle(client, key),
  });
}

export function useUpdateWorkItem(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateWorkItem }) => updateWorkItem(key, id, body).then(r => r.data),
    onSettled: () => settle(client, key),
  });
}

/** Drawn at once: the row leaves every list it is in and its minutes leave the issue. */
export function useDeleteWorkItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (item: WorkItem) => deleteWorkItem(item.issue, item.id).then(r => r.data),
    onMutate: async item => {
      const lists = { predicate: ({ queryKey }: { queryKey: readonly unknown[] }) => queryKey[2] === 'work-items' };
      await client.cancelQueries(lists);
      const previous = client.getQueriesData<Pages>(lists);
      client.setQueriesData<Pages>(lists, data =>
        data
          ? {
              ...data,
              pages: data.pages.map(page => ({ ...page, data: page.data.filter(row => row.id !== item.id) })),
            }
          : data,
      );
      const issue = client.getQueryData<Issue>(queryKeys.issue(item.issue));
      if (issue) {
        client.setQueryData(queryKeys.issue(item.issue), {
          ...issue,
          spent_minutes: Math.max(0, issue.spent_minutes - item.duration_minutes),
        });
      }
      return { previous, issue };
    },
    onError: (_error, item, context) => {
      for (const [queryKey, data] of context?.previous ?? []) client.setQueryData(queryKey, data);
      if (context?.issue) client.setQueryData(queryKeys.issue(item.issue), context.issue);
    },
    onSettled: (_data, _error, item) => settle(client, item.issue),
  });
}
