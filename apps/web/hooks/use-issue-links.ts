'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { IssueLinkGroup } from '@nothingleft/types';
import { createIssueLinks, deleteIssueLink, listIssueLinks } from '@lib/api/issue-links';
import { setIssueSignal } from '@lib/api/issues';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useIssueLinks(key: string) {
  return useQuery({
    queryKey: queryKeys.issueLinks(key),
    refetchInterval: POLL.list,
    queryFn: () => listIssueLinks(key).then(r => r.data),
  });
}

// A link is written on both ends, and a subtask link is the parent field: every one of them is stale now.
function refreshBothEnds(client: QueryClient, key: string, others: readonly string[]) {
  for (const k of [key, ...others]) {
    void client.invalidateQueries({ queryKey: queryKeys.issue(k), exact: true });
    void client.invalidateQueries({ queryKey: queryKeys.issueLinks(k) });
    void client.invalidateQueries({ queryKey: queryKeys.issueActivity(k) });
  }
}

export function useAddIssueLinks(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ link, issues }: { link: string; issues: string[] }) =>
      createIssueLinks(key, { link, issues }).then(r => r.data),
    onSuccess: groups => client.setQueryData(queryKeys.issueLinks(key), groups),
    onSettled: (_data, _error, { issues }) => refreshBothEnds(client, key, issues),
  });
}

export function useRemoveIssueLink(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ link, target }: { link: string; target: string }) =>
      deleteIssueLink(key, target, link).then(r => r.data),
    onMutate: async ({ link, target }) => {
      await client.cancelQueries({ queryKey: queryKeys.issueLinks(key) });
      const previous = client.getQueryData<IssueLinkGroup[]>(queryKeys.issueLinks(key));
      if (previous) {
        client.setQueryData<IssueLinkGroup[]>(
          queryKeys.issueLinks(key),
          previous
            .map(g =>
              g.link === link ? { ...g, count: g.count - 1, issues: g.issues.filter(i => i.key !== target) } : g,
            )
            .filter(g => g.count > 0),
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.issueLinks(key), context.previous);
    },
    onSuccess: groups => client.setQueryData(queryKeys.issueLinks(key), groups),
    onSettled: (_data, _error, { target }) => refreshBothEnds(client, key, [target]),
  });
}

export function useStarLinkedIssue(key: string) {
  const client = useQueryClient();
  const setStarred = (groups: IssueLinkGroup[] | undefined, target: string, on: boolean) =>
    groups?.map(g => ({ ...g, issues: g.issues.map(i => (i.key === target ? { ...i, starred: on } : i)) }));
  return useMutation({
    mutationFn: ({ target, on }: { target: string; on: boolean }) => setIssueSignal(target, 'star', on),
    onMutate: async ({ target, on }) => {
      await client.cancelQueries({ queryKey: queryKeys.issueLinks(key) });
      const previous = client.getQueryData<IssueLinkGroup[]>(queryKeys.issueLinks(key));
      client.setQueryData(queryKeys.issueLinks(key), setStarred(previous, target, on));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.issueLinks(key), context.previous);
    },
    onSettled: (_data, _error, { target }) => {
      void client.invalidateQueries({ queryKey: queryKeys.issue(target), exact: true });
      void client.invalidateQueries({ queryKey: queryKeys.issueSearches() });
    },
  });
}
