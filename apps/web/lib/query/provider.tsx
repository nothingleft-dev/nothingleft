'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { redirectToSignIn, setUnauthorizedHandler } from '@lib/api/client';

function createQueryClient() {
  return new QueryClient({
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

export function QueryProvider({ children }: { children: ReactNode }) {
  useEffect(watchFocus, []);
  const [client] = useState(() => {
    const queryClient = createQueryClient();
    setUnauthorizedHandler(() => {
      queryClient.clear();
      redirectToSignIn();
    });
    return queryClient;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
