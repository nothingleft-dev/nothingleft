'use client';

import { toast } from 'sonner';
import { RateLimitToastAction, RateLimitToastBody } from '@components/rate-limit';
import { isRateLimited } from '@lib/api/errors';

const RATE_LIMIT_TOAST = 'rate-limited';
const retries = new WeakMap<object, (() => void) | null>();

const withoutFullStop = (title: string) => title.replace(/\.$/, '');

function showRateLimited(title: string, retry: (() => void) | null) {
  toast.error(title, {
    id: RATE_LIMIT_TOAST,
    duration: Infinity,
    description: <RateLimitToastBody />,
    action: retry ? (
      <RateLimitToastAction
        onRetry={() => {
          toast.dismiss(RATE_LIMIT_TOAST);
          retry();
        }}
      />
    ) : undefined,
  });
}

/** One toast for every refused request, however many were refused; `retry` re-sends the one just refused. */
export function toastRateLimited(error: object, retry: (() => void) | null) {
  retries.set(error, retry);
  showRateLimited('Not saved', retry);
}

/**
 * The toast for a failed action: `title` names the action ("Could not export the issues"), the API's
 * message is the detail. A rate-limited one has already been toasted by the query provider, which
 * knew how to resend it but not what it was; the title here renames that same toast. `retry` adds
 * a Try again action, for an action that is safe to repeat (an export).
 */
export function toastError(title: string, error: Error, { retry }: { retry?: () => void } = {}) {
  if (isRateLimited(error)) {
    showRateLimited(withoutFullStop(title), retries.has(error) ? (retries.get(error) ?? null) : (retry ?? null));
    return;
  }
  toast.error(withoutFullStop(title), {
    description: error.message,
    ...(retry ? { action: { label: 'Try again', onClick: retry } } : {}),
  });
}
