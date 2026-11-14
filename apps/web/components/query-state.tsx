'use client';

import { TriangleAlert } from 'lucide-react';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { RateLimitReload } from '@components/rate-limit';
import { useRateLimit } from '@hooks/use-rate-limit';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';

export interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

export function RetryButton({ onRetry, size = 'sm' }: { onRetry: () => void; size?: 'sm' | 'xs' }) {
  return (
    <Button type="button" variant="outline" size={size} className="flex-none" onClick={onRetry}>
      Try again
    </Button>
  );
}

/** Nothing loaded: says so in place of the content, never an empty list or a zero. */
export function LoadError({
  children,
  detail,
  onRetry,
}: {
  children: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
}) {
  const { secondsLeft } = useRateLimit();
  // Under the request limit a retry would only be refused again; refused reads reload by themselves when it lifts.
  if (secondsLeft > 0) {
    return (
      <FormAlert tone="warning" title={children}>
        <RateLimitReload />
      </FormAlert>
    );
  }
  return (
    <FormAlert title={children} action={onRetry ? <RetryButton onRetry={onRetry} /> : undefined}>
      {detail}
    </FormAlert>
  );
}

/** A refresh failed: what loaded earlier stays, marked as possibly out of date. */
export function StaleNotice({
  children,
  onRetry,
  className,
}: {
  children: ReactNode;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div role="status" className={cn('flex items-center gap-2 py-1 text-2xs text-warning-fg', className)}>
      <TriangleAlert aria-hidden className="size-3.5 flex-none" />
      <span className="min-w-0 flex-1">{children}</span>
      <RetryButton onRetry={onRetry} size="xs" />
    </div>
  );
}

/** Denied and missing both render the 404 (DESIGN § 9), never a load error. */
export function notFoundOn404(error: unknown) {
  if (isApiError(error) && error.isNotFound) notFound();
}

export const errorDetail = (error: unknown) => (error instanceof Error ? error.message : undefined);

/**
 * One branch for every read: pending shows the caller's skeleton, a failure with nothing loaded shows
 * `LoadError`, a failed refresh keeps the data under a `StaleNotice`, and only real data can be empty.
 */
export function QueryState<T>({
  query,
  pending,
  error,
  stale,
  staleClassName,
  isEmpty,
  empty,
  children,
}: {
  query: QueryLike<T>;
  pending: ReactNode;
  error: ReactNode;
  stale?: ReactNode;
  staleClassName?: string;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const retry = () => void query.refetch();
  if (query.isPending) return pending;
  if (query.data === undefined) {
    return (
      <LoadError onRetry={retry} detail={errorDetail(query.error)}>
        {error}
      </LoadError>
    );
  }
  const notice =
    query.isError && stale ? (
      <StaleNotice onRetry={retry} className={staleClassName}>
        {stale}
      </StaleNotice>
    ) : null;
  return (
    <>
      {notice}
      {isEmpty?.(query.data) ? empty : children(query.data)}
    </>
  );
}
