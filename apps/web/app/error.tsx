'use client';

import Link from 'next/link';
import { Button } from '@components/ui/button';
import { CentredState, FullPageState, SECONDARY_LINK } from '@components/full-page-state';
import { isApiError } from '@lib/api/errors';

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const reference = isApiError(error) ? error.requestId : (error.digest ?? null);
  return (
    <CentredState>
      <FullPageState
        eyebrow="Error"
        title="This page stopped working"
        actions={
          <>
            <Button onClick={() => window.location.reload()}>Reload the page</Button>
            <Link href="/" className={SECONDARY_LINK}>
              Go home
            </Link>
          </>
        }
        footer={
          reference ? (
            <>
              Reference <span className="font-mono select-all">{reference}</span>
            </>
          ) : null
        }
      >
        Something broke while showing this page. Everything you saved is safe; an edit you had not saved yet may need
        typing again.
      </FullPageState>
    </CentredState>
  );
}
