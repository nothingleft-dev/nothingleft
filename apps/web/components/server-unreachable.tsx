'use client';

import { Button } from '@components/ui/button';
import { CentredState, FullPageState } from '@components/full-page-state';

export function ServerUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <CentredState>
      <FullPageState
        eyebrow="Connection"
        title="The server could not be reached"
        actions={<Button onClick={onRetry}>Try again</Button>}
      >
        Nothing was lost. Check the connection, then try again.
      </FullPageState>
    </CentredState>
  );
}
