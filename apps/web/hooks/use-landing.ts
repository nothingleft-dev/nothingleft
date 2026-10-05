'use client';

import { useQuery } from '@tanstack/react-query';
import { getLanding } from '@lib/api/me';
import { queryKeys } from '@lib/query/keys';

export function useLanding(enabled = true) {
  return useQuery({
    queryKey: queryKeys.landing(),
    queryFn: () => getLanding().then(r => r.data),
    enabled,
    // Decided per visit: where somebody lands depends on what they just did.
    staleTime: 0,
    gcTime: 0,
  });
}
