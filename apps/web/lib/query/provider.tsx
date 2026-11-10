'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { MutationCache, QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { redirectToSignIn, setUnauthorizedHandler } from '@lib/api/client';
import { isRateLimited } from '@lib/api/errors';
import { rateLimitState, subscribeRateLimit } from '@lib/api/rate-limit';

/** Told about a save the rate limit refused; `retry` sends it again. */
export type RateLimitedHandler = (error: Error, retry: () => void) => void;

function createQueryClient(onRateLimited: RateLimitedHandler) {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, variables, _context, mutation) => {
        // Re-running the refused mutation keeps its optimistic update and its invalidations.
        if (isRateLimited(error)) onRateLimited(error, () => void mutation.execute(variables).catch(() => {}));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: false,
      },
      mutations: { retry: false },
    },
  });
}

// Polling runs only while someone is looking: a hidden tab or a window without focus is
// unfocused, so no interval fires there, and refocusing refetches what went stale.
function watchFocus() {
  focusManager.setEventListener(handleFocus => {
    const update = () => handleFocus(document.visibilityState === 'visible' && document.hasFocus());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  });
}

// Whatever the limit refused loads again once it lifts; refused saves wait for a click instead.
function refetchWhenLimitLifts(client: QueryClient) {
  return subscribeRateLimit(() => {
    if (rateLimitState().until) return;
    void client.invalidateQueries({ predicate: query => isRateLimited(query.state.error) });
  });
}

export function QueryProvider({ children, onRateLimited }: { children: ReactNode; onRateLimited: RateLimitedHandler }) {
  useEffect(watchFocus, []);
  const [client] = useState(() => {
    const queryClient = createQueryClient(onRateLimited);
    setUnauthorizedHandler(() => {
      queryClient.clear();
      redirectToSignIn();
    });
    return queryClient;
  });
  useEffect(() => refetchWhenLimitLifts(client), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
