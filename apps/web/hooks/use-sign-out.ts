'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signOut } from '@lib/api/auth';
import { clearRecentlyViewed } from '@hooks/use-recently-viewed';

/** `next` brings the person back after signing in again, as someone else. */
export function useSignOut(next?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: signOut,
    // A full navigation, so nothing the old session owned survives in memory.
    onSettled: () => {
      client.clear();
      clearRecentlyViewed();
      const target = new URL('/sign-in', window.location.origin);
      if (next) target.searchParams.set('next', next);
      window.location.assign(target.toString());
    },
  });
}
