'use client';

import { toast } from 'sonner';
import { RateLimitToastBody } from '@components/rate-limit';
import { isRateLimited } from '@lib/api/errors';

const RATE_LIMIT_TOAST = 'rate-limited';
const shown = new WeakSet<object>();

/** One toast for every refused request, however many were refused; `retry` re-sends the one just refused. */
export function toastRateLimited(error: object, retry: (() => void) | null) {
  shown.add(error);
  toast.error('Not saved', {
    id: RATE_LIMIT_TOAST,
    duration: Infinity,
    description: (
      <RateLimitToastBody
        onRetry={
          retry
            ? () => {
                toast.dismiss(RATE_LIMIT_TOAST);
                retry();
              }
            : null
        }
      />
    ),
  });
}

/**
 * The toast for a failed action: `title` names the action ("Could not export the issues"), the API's
 * message is the detail. A rate-limited one has already been toasted by the query provider. `retry`
 * adds a Try again action, for an action that is safe to repeat (an export).
 */
export function toastError(title: string, error: Error, { retry }: { retry?: () => void } = {}) {
  if (isRateLimited(error)) {
    if (!shown.has(error)) toastRateLimited(error, retry ?? null);
    return;
  }
  toast.error(title, {
    description: error.message,
    ...(retry ? { action: { label: 'Try again', onClick: retry } } : {}),
  });
}
