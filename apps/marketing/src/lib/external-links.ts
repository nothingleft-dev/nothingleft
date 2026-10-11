const OWN_HOST = /(^|\.)nothingleft\.dev$/i;
// Script and style bodies can hold strings that look like markup, so they pass through untouched.
const ANCHOR_OR_RAW = /<(script|style)\b[\s\S]*?<\/\1>|<a\b[^>]*>/gi;

export function isExternalHref(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return !OWN_HOST.test(new URL(href).hostname);
  } catch {
    return false;
  }
}

export const anchorHref = (tag: string) => /\shref="([^"]*)"/i.exec(tag)?.[1]?.replace(/&amp;/g, '&');

export function openExternalLinksInNewTab(html: string): string {
  return html.replace(ANCHOR_OR_RAW, (tag, raw?: string) => {
    if (raw) return tag;
    const href = anchorHref(tag);
    if (!href || !isExternalHref(href) || /\starget=/i.test(tag)) return tag;
    const rel = /\srel="([^"]*)"/i.exec(tag);
    const values = new Set([...(rel?.[1] ?? '').split(/\s+/).filter(Boolean), 'noopener']);
    const withoutRel = rel ? tag.replace(rel[0], '') : tag;
    return withoutRel.replace(/^<a\b/i, `<a target="_blank" rel="${[...values].join(' ')}"`);
  });
}
