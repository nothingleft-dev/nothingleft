import Script from 'next/script';
import { env } from '@lib/env';

/**
 * The one place for third-party tags that must load on every page. Each tag is gated by its
 * own NEXT_PUBLIC_* variable, so an unset variable renders nothing. Product analytics stays
 * in packages/analytics (docs/analytics.md); anything added here still obeys rule 11 of
 * CLAUDE.md — IDs and counts only, never customer content.
 */
export function SiteScripts() {
  return (
    <>
      {env.gaMeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${env.gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${env.gaMeasurementId}', { anonymize_ip: true });`}
          </Script>
        </>
      ) : null}
    </>
  );
}
