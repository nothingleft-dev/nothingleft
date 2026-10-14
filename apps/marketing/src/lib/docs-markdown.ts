import { rewriteDocHref } from './markdown/doc-links';
import { markdownHref } from './markdown-source';

// Copied or downloaded Markdown leaves the site, so its relative links become absolute.
export function publishableMarkdown(body: string): string {
  return body.replace(/\]\(([^)\s]+)\)/g, (match, href: string) => {
    const rewritten = markdownHref(rewriteDocHref(href));
    if (rewritten === href) return match;
    return `](${rewritten})`;
  });
}

export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.split(/\s+/).length / 220));
}
