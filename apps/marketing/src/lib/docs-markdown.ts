import { SITE_URL } from './site';
import { rewriteDocHref } from './markdown/doc-links';

// Copied or downloaded Markdown leaves the site, so its relative links become absolute.
export function publishableMarkdown(body: string): string {
  return body.replace(/\]\(([^)\s]+)\)/g, (match, href: string) => {
    const rewritten = rewriteDocHref(href);
    if (rewritten === href) return match;
    return `](${rewritten.startsWith('/') ? `${SITE_URL}${rewritten}` : rewritten})`;
  });
}

export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.split(/\s+/).length / 220));
}
