'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listSessions, revokeOtherSessions, revokeSession } from '@lib/api/sessions';
import type { Session } from '@nothingleft/types';
import { optimisticList } from '@lib/query/optimistic';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions(),
    queryFn: () => listSessions().then(r => r.data),
    refetchInterval: POLL.admin,
  });
}

export function useRevokeSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: revokeSession,
    onMutate: async id => {
      const previous = client.getQueryData(queryKeys.sessions());
      client.setQueryData(queryKeys.sessions(), (rows: Awaited<ReturnType<typeof listSessions>>['data'] = []) =>
        rows.filter(s => s.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => client.setQueryData(queryKeys.sessions(), context?.previous),
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.sessions() }),
  });
}

export function useRevokeOtherSessions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: revokeOtherSessions,
    ...optimisticList<Session[], void>(client, queryKeys.sessions(), rows => rows.filter(s => s.current)),
    onSuccess: response => client.setQueryData(queryKeys.sessions(), response.data),
  });
}
