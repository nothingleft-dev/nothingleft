'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { env } from '@lib/env';
import { pageContext } from '@lib/analytics/page-context';

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

// gtag.js only reads Arguments objects from the data layer; a plain array is ignored.
function gtag(..._args: unknown[]): void {
  window.dataLayer = window.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

/**
 * The one place for third-party tags that must load on every page. Each tag is gated by its
 * own NEXT_PUBLIC_* variable, so an unset variable renders nothing. Product analytics stays
 * in packages/analytics (docs/analytics.md); anything added here still obeys rule 11 of
 * CLAUDE.md — IDs and counts only, never customer content.
 */
export function SiteScripts() {
  return env.gaMeasurementId ? <GoogleAnalytics id={env.gaMeasurementId} /> : null;
}

// Page views are sent by hand with a redacted location, and `set` makes every other event,
// enhanced measurement included, report that location instead of the real URL.
function GoogleAnalytics({ id }: { id: string }) {
  const pathname = usePathname();
  const configured = useRef(false);

  useEffect(() => {
    const context = pageContext(window.location, configured.current ? '' : document.referrer);
    if (!configured.current) {
      gtag('js', new Date());
      gtag('config', id, { ...context, send_page_view: false });
      configured.current = true;
    }
    gtag('set', context);
    gtag('event', 'page_view', context);
  }, [id, pathname]);

  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />;
}
