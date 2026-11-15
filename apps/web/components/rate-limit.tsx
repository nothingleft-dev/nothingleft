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
  // The shell hands over a retry only once the session request has been refused.
  const refused = onRetry !== undefined;
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
        eyebrow="Request limit"
        title="You have hit the request limit"
        actions={
          <>
            <Button onClick={onRetry} disabled={!onRetry || secondsLeft > 0}>
              <TryAgainLabel seconds={secondsLeft} />
            </Button>
            {refused ? (
              <span className="text-xs text-text-secondary">Still paused: the server refused the last try.</span>
            ) : null}
          </>
        }
      >
        The app sent {perMinute ? `more than ${perMinute} requests` : 'too many requests'} in a minute, so the server
        paused it. Nothing was lost, and the app loads again by itself.
      </FullPageState>
    </CentredState>
  );
}

function TryAgainLabel({ seconds }: { seconds: number }) {
  return seconds > 0 ? (
    <span>
      Try again in <Countdown seconds={seconds} />
    </span>
  ) : (
    'Try again'
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
        Everything loads again by itself in <Countdown seconds={secondsLeft} />; a change made before then is not saved.
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

/** The detail of the one toast refused saves share; the countdown lives here so the action stays short. */
export function RateLimitToastBody() {
  const { secondsLeft } = useRateLimit();
  return (
    <>
      You have hit the request limit; nothing was changed.{' '}
      {secondsLeft > 0 ? (
        <>
          Try again in <Countdown seconds={secondsLeft} />.
        </>
      ) : (
        'You can try again now.'
      )}
    </>
  );
}

/** The toast's one action, level with its title like every toast action; it unlocks at zero. */
export function RateLimitToastAction({ onRetry }: { onRetry: () => void }) {
  const waiting = useRateLimit().secondsLeft > 0;
  return (
    <Button
      data-button
      size="xs"
      variant="outline"
      disabled={waiting}
      // The toast library's own rule gives every action a pointer, and it outranks the utilities.
      style={waiting ? { cursor: 'default' } : undefined}
      onClick={onRetry}
    >
      Try again
    </Button>
  );
}
