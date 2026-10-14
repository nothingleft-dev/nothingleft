import { isPublished } from '../data/docs';
import { SITE_URL } from './site';

export const MARKETING_MARKDOWN_PATHS: Record<string, string> = {
  '/': '/index.md',
  '/pricing': '/pricing.md',
  '/solutions/self-hosting': '/solutions/self-hosting.md',
  '/support': '/support.md',
};

/** Only advertise Markdown routes that we actually publish. */
export function markdownPath(path: string): string | undefined {
  if (Object.hasOwn(MARKETING_MARKDOWN_PATHS, path)) return MARKETING_MARKDOWN_PATHS[path];
  const doc = /^\/docs\/([a-z0-9-]+)$/.exec(path)?.[1];
  return doc && doc !== 'api' && isPublished(doc) ? `${path}.md` : undefined;
}

/** Keep local links portable and prefer Markdown, preserving queries and fragments. */
export function markdownHref(href: string): string {
  if (!href.startsWith('/') && !href.startsWith(`${SITE_URL}/`)) return href;
  const url = new URL(href, SITE_URL);
  if (url.origin !== SITE_URL) return href;
  // Marketing summaries omit interactive controls and do not share HTML section IDs.
  if (url.hash && Object.hasOwn(MARKETING_MARKDOWN_PATHS, url.pathname)) return url.href;
  url.pathname = markdownPath(url.pathname) ?? url.pathname;
  return url.href;
}
