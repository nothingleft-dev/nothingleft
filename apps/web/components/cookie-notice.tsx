'use client';

import { CookieIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type FocusEvent } from 'react';
import { ExternalLink } from '@components/auth/auth-card';
import { Button } from '@components/ui/button';
import { cn } from '@lib/utils';

// On the parent domain, so dismissing the notice on either site hides it on both.
const DISMISSED_COOKIE = 'nl_notice_dismissed';
const ONE_YEAR_S = 365 * 24 * 60 * 60;
const LIFETIME_MS = 10_000;

const noSubscription = () => () => {};

function wasDismissed() {
  try {
    return document.cookie.split('; ').includes(`${DISMISSED_COOKIE}=1`);
  } catch {
    return false;
  }
}

function rememberDismissal() {
  const { hostname, protocol } = location;
  const shared = hostname === 'nothingleft.dev' || hostname.endsWith('.nothingleft.dev');
  try {
    document.cookie = [
      `${DISMISSED_COOKIE}=1`,
      'Path=/',
      `Max-Age=${ONE_YEAR_S}`,
      'SameSite=Lax',
      ...(shared ? ['Domain=.nothingleft.dev'] : []),
      ...(protocol === 'https:' ? ['Secure'] : []),
    ].join('; ');
  } catch {
    // Without cookies the notice simply returns on the next visit.
  }
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** Notice only: analytics loads either way, so dismissing is the one choice it offers. */
export function CookieNotice() {
  const titleId = useId();
  const dismissedBefore = useSyncExternalStore(noSubscription, wasDismissed, () => true);
  const tabHidden = useSyncExternalStore(
    subscribeToVisibility,
    () => document.hidden,
    () => false,
  );
  const [closed, setClosed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(LIFETIME_MS);

  const open = !dismissedBefore && !closed;
  // A tab opened in the background must not use up the notice before anyone sees it.
  const paused = hovered || focused || tabHidden;

  const dismiss = useCallback(() => {
    rememberDismissal();
    setClosed(true);
  }, []);

  useEffect(() => {
    if (!open || paused) return;
    const startedAt = performance.now();
    const timer = window.setTimeout(dismiss, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= performance.now() - startedAt;
    };
  }, [dismiss, open, paused]);

  if (!open) return null;

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };

  return (
    <section
      aria-labelledby={titleId}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      className="fixed inset-x-4 bottom-4 z-50 overflow-hidden rounded-lg bg-raised p-4 text-text shadow-popover sm:right-auto sm:w-[360px]"
    >
      <div className="flex items-center gap-2 pr-8">
        <CookieIcon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <h2 id={titleId} className="text-sm font-semibold">
          We use cookies
        </h2>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Close cookie notice"
        className="absolute top-2.5 right-2.5 text-text-secondary hover:text-text"
        onClick={dismiss}
      >
        <XIcon />
      </Button>
      <p className="mt-2 text-xs text-text-secondary">
        We use analytics to understand how the site is used. Details in our{' '}
        <ExternalLink href="https://nothingleft.dev/privacy">privacy policy</ExternalLink>.
      </p>
      <Button type="button" className="mt-3 w-full" onClick={dismiss}>
        Accept
      </Button>
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 bottom-0 h-0.5 origin-left bg-text animate-[cookie-notice-countdown_10s_linear_forwards] motion-reduce:hidden',
          paused && '[animation-play-state:paused]',
        )}
      />
    </section>
  );
}
