import { defineMiddleware } from 'astro:middleware';
import { openExternalLinksInNewTab } from '@lib/external-links';

// Every page passes through here at build time, so no component or Markdown page can miss the rule.
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!response.headers.get('content-type')?.includes('text/html')) return response;
  const html = openExternalLinksInNewTab(await response.text());
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
});
