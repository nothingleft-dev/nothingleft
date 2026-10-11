'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { env } from '@lib/env';
import { isAuthRoute } from '@lib/auth-routes';
import { pageContext } from '@lib/analytics/page-context';
import { gtag, setGoogleAnalyticsEnabled } from '@lib/analytics/google-analytics';

/**
 * The one place for third-party tags. Each tag is gated by its own NEXT_PUBLIC_* variable, so
 * an unset variable renders nothing. Product analytics stays in packages/analytics
 * (docs/analytics.md); anything added here still obeys rule 11 of CLAUDE.md — IDs and counts
 * only, never customer content.
 */
export function SiteScripts() {
  return env.gaMeasurementId ? <GoogleAnalytics id={env.gaMeasurementId} /> : null;
}

// Conversion tracking only: the tag loads on the auth pages and is switched off everywhere
// else, so a tab that signs in and stays in the app reports nothing from inside it. Page views
// are sent by hand with a redacted location, and `set` makes every other event report it too.
function GoogleAnalytics({ id }: { id: string }) {
  const pathname = usePathname();
  const tracked = isAuthRoute(pathname);
  const [loaded, setLoaded] = useState(tracked);
  if (tracked && !loaded) setLoaded(true);
  const configured = useRef(false);

  useEffect(() => {
    if (!tracked && !configured.current) return;
    setGoogleAnalyticsEnabled(id, tracked);
    if (!tracked) return;

    const context = pageContext(window.location, configured.current ? '' : document.referrer);
    if (!configured.current) {
      gtag('js', new Date());
      gtag('config', id, { ...context, send_page_view: false });
      configured.current = true;
    }
    gtag('set', context);
    gtag('event', 'page_view', context);
  }, [id, pathname, tracked]);

  return loaded ? (
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
  ) : null;
}
