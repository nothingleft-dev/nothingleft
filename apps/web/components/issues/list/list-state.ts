'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { readListState, writeListState, type ListUrlState } from '@lib/issue-list/url-state';

/** The list's state lives in the URL, so every view is shareable by copying the address. */
export function useListUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(() => readListState(params), [params]);
  const wantsFocus = params.get('focus') === '1';

  const navigate = useCallback(
    (next: Partial<ListUrlState>, mode: 'push' | 'replace' = 'push') => {
      const url = `${pathname}${writeListState({ ...readListState(params), ...next }, params)}` as Route;
      if (mode === 'push') router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router, pathname, params],
  );

  return { state, navigate, wantsFocus };
}
