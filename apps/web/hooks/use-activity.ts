'use client';

import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { downloadActivityCsv, listActivity, type ActivityFilters } from '@lib/api/activity';
import { saveDownload } from '@lib/files';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useActivity(slug: string, filters: ActivityFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.activity(slug, filters),
    refetchInterval: POLL.admin,
    queryFn: ({ pageParam }) => listActivity(slug, { ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.meta.pagination?.next_cursor ?? null,
    select: result => ({ rows: result.pages.flatMap(page => page.data) }),
  });
}

export function useActivityExport(slug: string) {
  return useMutation({
    mutationFn: (filters: ActivityFilters) => downloadActivityCsv(slug, filters),
    onSuccess: saveDownload,
  });
}
