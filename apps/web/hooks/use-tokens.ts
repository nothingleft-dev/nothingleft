'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePersonalAccessToken, PersonalAccessToken } from '@nothingleft/types';
import { createToken, listTokens, revokeToken } from '@lib/api/tokens';
import { optimisticList } from '@lib/query/optimistic';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useTokens() {
  return useQuery({
    queryKey: queryKeys.tokens(),
    queryFn: () => listTokens().then(r => r.data),
    refetchInterval: POLL.admin,
  });
}

/** When a new token is first used; polls until then so a waiting screen can say "Connected". */
export function useTokenFirstUse(id: number | null) {
  return useQuery({
    queryKey: queryKeys.tokens(),
    queryFn: () => listTokens().then(r => r.data),
    enabled: id !== null,
    select: tokens => tokens.find(t => t.id === id)?.last_used_at ?? null,
    refetchInterval: query => (query.state.data?.find(t => t.id === id)?.last_used_at ? false : POLL.waiting(query)),
  });
}

export function useCreateToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePersonalAccessToken) => createToken(body).then(r => r.data),
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.tokens() }),
  });
}

export function useRevokeToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: revokeToken,
    ...optimisticList<PersonalAccessToken[], number>(client, queryKeys.tokens(), (rows, id) =>
      rows.map(t => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t)),
    ),
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.tokens() }),
  });
}
