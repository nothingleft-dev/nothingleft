'use client';

import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { BacklogMove, Issue, SuccessEnvelope } from '@nothingleft/types';
import { listBacklog, moveInBacklog } from '@lib/api/sprints';
import { isApiError } from '@lib/api/errors';
import { invalidateAgile } from '@lib/query/agile';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export const BACKLOG_PAGE_SIZE = 100;

type Pages = InfiniteData<SuccessEnvelope<Issue[]>, number>;

/** One container in drag order: the backlog (`sprint` null) or one sprint, by slug. */
export function useBacklog(projectKey: string, sprint: string | null, q: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.backlogOf(projectKey, sprint, q),
    refetchInterval: POLL.list,
    queryFn: ({ pageParam }) =>
      listBacklog(projectKey, { sprint: sprint ?? undefined, q, limit: BACKLOG_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.meta.pagination?.has_more ? pages.length * BACKLOG_PAGE_SIZE : undefined),
    retry: (count, error) => count < 1 && !(isApiError(error) && error.status === 400),
    placeholderData: previous => previous,
    enabled,
  });
}

export interface BacklogDrop {
  issues: string[];
  /** The target container: a sprint slug, or null for the backlog. */
  sprint: string | null;
  before?: string;
  after?: string;
}

const containerOf = (queryKey: readonly unknown[]) => queryKey[2] as string;

/** Draws the drop in every cached container of the project at once, then asks the API. */
export function useBacklogMove(projectKey: string) {
  const client = useQueryClient();
  const root = queryKeys.backlog(projectKey);
  return useMutation({
    mutationFn: ({ issues, sprint, before, after }: BacklogDrop) => {
      const body: BacklogMove = { issues, sprint: sprint ?? null };
      if (before) body.before = before;
      if (after) body.after = after;
      return moveInBacklog(projectKey, body).then(r => r.data);
    },
    onMutate: async drop => {
      await client.cancelQueries({ queryKey: root });
      const previous = client.getQueriesData<Pages>({ queryKey: root });
      const moving = new Set(drop.issues);
      const moved: Issue[] = [];
      for (const [, data] of previous)
        for (const page of data?.pages ?? []) for (const i of page.data) if (moving.has(i.key)) moved.push(i);
      const unique = drop.issues.map(k => moved.find(i => i.key === k)).filter((i): i is Issue => Boolean(i));
      for (const [queryKey, data] of previous) {
        if (!data) continue;
        const target = containerOf(queryKey) === (drop.sprint ?? 'backlog');
        const pages = data.pages.map(page => ({ ...page, data: page.data.filter(i => !moving.has(i.key)) }));
        if (target) placeInto(pages, unique, drop);
        client.setQueryData<Pages>(queryKey, { ...data, pages });
      }
      return { previous };
    },
    onError: (_error, _drop, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
    onSettled: (_data, _error, drop) => {
      invalidateAgile(client);
      for (const key of drop.issues) void client.invalidateQueries({ queryKey: queryKeys.issue(key), exact: true });
    },
  });
}

function placeInto(pages: SuccessEnvelope<Issue[]>[], issues: Issue[], drop: BacklogDrop) {
  const anchor = drop.before ?? drop.after;
  for (const page of pages) {
    const at = anchor ? page.data.findIndex(i => i.key === anchor) : -1;
    if (at >= 0) {
      page.data.splice(drop.before ? at : at + 1, 0, ...issues);
      return;
    }
  }
  pages.at(-1)?.data.push(...issues);
}
