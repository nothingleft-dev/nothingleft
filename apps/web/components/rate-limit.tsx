'use client';

import { useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { Button } from '@components/ui/button';
import { useRateLimit } from '@hooks/use-rate-limit';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function Countdown({ seconds }: { seconds: number }) {
  return <span className="font-mono tabular">{clock(seconds)}</span>;
}

/** The shell could not start because its first requests were limited; it starts by itself at zero. */
export function RateLimitScreen({ onRetry }: { onRetry?: () => void }) {
  const { secondsLeft, totalSeconds, perMinute } = useRateLimit();
  const retry = useRef(onRetry);
  useEffect(() => {
    retry.current = onRetry;
  });
  useEffect(() => {
    if (secondsLeft === 0) retry.current?.();
  }, [secondsLeft]);
  const progress = totalSeconds ? (totalSeconds - secondsLeft) / totalSeconds : 1;

  return (
    <main className="grid min-h-dvh place-items-center bg-app px-page-x-mobile">
      <div className="flex w-full max-w-sm flex-col items-start gap-3">
        <span aria-hidden className="grid size-9 place-items-center rounded-md bg-warning-bg text-warning-fg">
          <Timer className="size-icon" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">You’re moving faster than the limit</h1>
        <p className="text-text-secondary">
          Your session sent {perMinute ? `more than ${perMinute} requests` : 'too many requests'} in the last minute, so
          the server is pausing it briefly. Nothing was lost.{' '}
          {secondsLeft > 0 ? (
            <>
              This page picks up again in <Countdown seconds={secondsLeft} />.
            </>
          ) : (
            'Picking up again now.'
          )}
        </p>
        <div aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-inset">
          <div
            className="h-full bg-text-muted transition-[width] duration-300 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          {onRetry ? (
            <Button onClick={onRetry} disabled={secondsLeft > 0}>
              Try again
            </Button>
          ) : null}
          <span className="text-xs text-text-muted">Reloads by itself</span>
        </div>
      </div>
    </main>
  );
}

export function RateLimitBanner() {
  const { secondsLeft, perMinute } = useRateLimit();
  if (secondsLeft === 0) return null;
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-2.5 rounded-md border border-warning-fg/25 bg-warning-bg px-3 py-2.5 text-warning-fg"
    >
      <Timer className="mt-0.5 size-icon-sm flex-none" />
      <p className="flex-1 text-xs leading-5">
        <span className="font-medium">You’ve hit the request limit{perMinute ? ` of ${perMinute} a minute` : ''}.</span>{' '}
        Everything is saved; the app catches up in <Countdown seconds={secondsLeft} />.
      </p>
    </div>
  );
}

/** The body of the one toast refused saves share; Retry unlocks at zero. */
export function RateLimitToastBody({ onRetry }: { onRetry: (() => void) | null }) {
  const { secondsLeft } = useRateLimit();
  return (
    <span className="flex items-center gap-3">
      <span className="flex-1">
        Too many requests in the last minute; nothing was changed.{' '}
        {secondsLeft > 0 ? (
          <>
            {onRetry ? 'Retry' : 'Try again'} in <Countdown seconds={secondsLeft} />.
          </>
        ) : onRetry ? null : (
          'You can try again now.'
        )}
      </span>
      {onRetry ? (
        <Button size="sm" variant="outline" disabled={secondsLeft > 0} onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </span>
  );
}
