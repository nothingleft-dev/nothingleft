'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { TagContext } from '@nothingleft/types';
import { listTags, listTagsInUse } from '@lib/api/tags';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useTags(q: string, enabled = true, context?: TagContext) {
  return useQuery({
    queryKey: queryKeys.tags(q, context),
    queryFn: () => listTags(q, context).then(r => r.data),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** The knowledge base's tag cloud: tags on the project's articles, with counts. */
export function useArticleTagCloud(project: string) {
  return useQuery({
    queryKey: queryKeys.articleTagCloud(project),
    queryFn: () => listTagsInUse(project).then(r => r.data),
    refetchInterval: POLL.list,
  });
}
