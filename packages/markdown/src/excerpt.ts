import type { Node, Parent } from 'mdast';
import { parseMarkdown } from './parse.ts';

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'tableCell', 'code', 'blockquote']);

/** The visible words of a document, one space apart: no markup, no URLs, no images. */
export function markdownPlainText(markdown: string): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') {
      parts.push((node as unknown as { value: string }).value);
    }
    const children = (node as Parent).children;
    if (Array.isArray(children)) for (const child of children) walk(child);
    if (BLOCKS.has(node.type)) parts.push(' ');
  };
  walk(parseMarkdown(markdown));
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/**
 * A plain-text passage of at most `length` characters: around the first of `terms` it finds
 * (case-insensitive, by prefix so `logins` finds `login`), else from the start.
 */
export function markdownExcerpt(markdown: string, terms: readonly string[] = [], length = 240): string {
  const text = markdownPlainText(markdown);
  if (text.length <= length) return text;
  const lower = text.toLowerCase();
  const hits = terms
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 1)
    .map(t => lower.indexOf(t.slice(0, Math.max(3, t.length - 2))))
    .filter(i => i >= 0);
  const hit = hits.length > 0 ? Math.min(...hits) : 0;
  let start = Math.max(0, hit - Math.floor(length / 3));
  if (start > 0) {
    const space = text.indexOf(' ', start);
    start = space >= 0 && space < hit ? space + 1 : start;
  }
  const end = Math.min(text.length, start + length);
  const cut = end < text.length ? text.lastIndexOf(' ', end) : end;
  const body = text.slice(start, cut > start ? cut : end).trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}
