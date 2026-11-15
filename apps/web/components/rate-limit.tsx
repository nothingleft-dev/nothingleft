'use client';

import { useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { Button } from '@components/ui/button';
import { CentredState, FullPageState } from '@components/full-page-state';
import { useRateLimit } from '@hooks/use-rate-limit';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function Countdown({ seconds }: { seconds: number }) {
  return <span className="font-mono tabular">{clock(seconds)}</span>;
}

/** The shell could not start because its first requests were limited; it starts by itself at zero. */
export function RateLimitScreen({ onRetry }: { onRetry?: () => void }) {
  const { secondsLeft, perMinute } = useRateLimit();
  const retry = useRef(onRetry);
  useEffect(() => {
    retry.current = onRetry;
  });
  useEffect(() => {
    if (secondsLeft === 0) retry.current?.();
  }, [secondsLeft]);

  return (
    <CentredState>
      <FullPageState
        eyebrow={
          <span className="flex items-center gap-1.5 text-warning-fg">
            <Timer aria-hidden className="size-icon-sm" />
            Request limit
          </span>
        }
        title="You have hit the request limit"
        actions={
          <Button onClick={onRetry} disabled={!onRetry || secondsLeft > 0}>
            {secondsLeft > 0 ? (
              <span>
                Try again in <Countdown seconds={secondsLeft} />
              </span>
            ) : (
              'Try again'
            )}
          </Button>
        }
      >
        Your session sent {perMinute ? `more than ${perMinute} requests` : 'too many requests'} in a minute, so the
        server paused it. Nothing was lost, and the app loads again by itself.
      </FullPageState>
    </CentredState>
  );
}

export function RateLimitBanner() {
  const { secondsLeft, perMinute } = useRateLimit();
  const limited = secondsLeft > 0;
  // Reads wait for the limit instead of failing; a skeleton that kept pulsing would say they are loading.
  useEffect(() => {
    if (!limited) return;
    document.documentElement.dataset.rateLimited = '';
    return () => void delete document.documentElement.dataset.rateLimited;
  }, [limited]);
  if (!limited) return null;
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-2.5 rounded-md border border-warning-fg/25 bg-warning-bg px-3 py-2.5 text-warning-fg"
    >
      <Timer className="mt-0.5 size-icon-sm flex-none" />
      <p className="flex-1 text-xs leading-5">
        <span className="font-medium">
          You have hit the request limit{perMinute ? ` of ${perMinute} a minute` : ''}.
        </span>{' '}
        Pages load again by themselves in <Countdown seconds={secondsLeft} />; a change you make before then is not
        saved.
      </p>
    </div>
  );
}

/** The line a load error carries while the limit lasts. */
export function RateLimitReload() {
  const { secondsLeft } = useRateLimit();
  return (
    <>
      Loads again by itself in <Countdown seconds={secondsLeft} />.
    </>
  );
}

/** The line an inline form error carries when the limit refused the submit. */
export function RateLimitWait() {
  const { secondsLeft } = useRateLimit();
  return secondsLeft > 0 ? (
    <>
      Try again in <Countdown seconds={secondsLeft} />.
    </>
  ) : (
    <>You can try again now.</>
  );
}

/** The body of the one toast refused saves share; Retry unlocks at zero. */
export function RateLimitToastBody({ onRetry }: { onRetry: (() => void) | null }) {
  const { secondsLeft } = useRateLimit();
  const waiting = secondsLeft > 0;
  return (
    <span className="flex flex-col items-start gap-2">
      <span>
        Too many requests in the last minute; nothing was changed.
        {onRetry ? null : waiting ? (
          <>
            {' '}
            Try again in <Countdown seconds={secondsLeft} />.
          </>
        ) : (
          ' You can try again now.'
        )}
      </span>
      {onRetry ? (
        <Button
          size="xs"
          variant="outline"
          className="h-control-sm px-2.5 text-text"
          disabled={waiting}
          onClick={onRetry}
        >
          {waiting ? (
            <span>
              Retry in <Countdown seconds={secondsLeft} />
            </span>
          ) : (
            'Retry'
          )}
        </Button>
      ) : null}
    </span>
  );
}
