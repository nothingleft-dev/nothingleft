'use client';

import { Button } from '@components/ui/button';
import { isApiError } from '@lib/api/errors';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const requestId = isApiError(error) ? error.requestId : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-app px-page-x-mobile">
      <div className="flex max-w-sm flex-col items-start gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-text-secondary">{error.message} Nothing was saved. Try again, or reload the page.</p>
        {requestId ? <p className="font-mono text-2xs text-text-muted">request {requestId}</p> : null}
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
