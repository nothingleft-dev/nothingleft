'use client';

import { Button } from '@components/ui/button';
import { isApiError } from '@lib/api/errors';

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const reference = isApiError(error) ? error.requestId : (error.digest ?? null);
  return (
    <main className="grid min-h-dvh place-items-center bg-app px-page-x-mobile">
      <div className="flex max-w-sm flex-col items-start gap-3">
        <p className="font-mono text-2xs text-text-muted">Error</p>
        <h1 className="text-xl font-semibold tracking-tight">This page stopped working</h1>
        <p className="text-text-secondary">
          A fault in the app stopped the page from drawing. Everything you saved is safe; only an edit you had not saved
          yet may need typing again.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
        {reference ? <p className="font-mono text-2xs text-text-muted">Reference {reference}</p> : null}
      </div>
    </main>
  );
}
