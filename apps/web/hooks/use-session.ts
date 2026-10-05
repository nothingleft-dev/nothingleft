'use client';

import { useQuery } from '@tanstack/react-query';
import type { Me } from '@nothingleft/types';
import { isApiError } from '@lib/api/errors';
import { getMe } from '@lib/api/me';
import { queryKeys } from '@lib/query/keys';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-in'; user: Me }
  | { status: 'signed-out' }
  | { status: 'error'; error: unknown; retry: () => void };

export function useSession(): SessionState {
  const query = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => getMe().then(r => r.data),
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (query.isPending) return { status: 'loading' };
  if (query.isSuccess) return { status: 'signed-in', user: query.data };
  if (isApiError(query.error) && query.error.isUnauthorized) return { status: 'signed-out' };
  return { status: 'error', error: query.error, retry: () => void query.refetch() };
}
