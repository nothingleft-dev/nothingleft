import type { OAuthProvider } from '@nothingleft/types';
import { env } from '@lib/env';

declare global {
  interface Window {
    dataLayer?: unknown[];
    [gaDisable: `ga-disable-${string}`]: boolean | undefined;
  }
}

// gtag.js only reads Arguments objects from the data layer; a plain array is ignored.
export function gtag(..._args: unknown[]): void {
  window.dataLayer = window.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

// Queued rather than set directly, so an event pushed just before leaving an auth page is
// processed while tracking is still on, even when gtag.js finishes loading afterwards.
export function setGoogleAnalyticsEnabled(id: string, enabled: boolean) {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(() => {
    window[`ga-disable-${id}`] = !enabled;
  });
}

/** GA4's recommended conversion events. The method is the only parameter, never the account. */
export function trackAuthConversion(event: 'sign_up' | 'login', method: 'email' | OAuthProvider) {
  if (env.gaMeasurementId) gtag('event', event, { method });
}
