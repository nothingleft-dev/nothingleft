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

/** The toast for a failed action. A rate-limited one has already been toasted by the query provider. */
export function toastError(error: Error) {
  if (isRateLimited(error)) {
    if (!shown.has(error)) toastRateLimited(error, null);
    return;
  }
  toast.error(error.message);
}
