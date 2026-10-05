import { MARKDOWN_HARD_LIMIT_BYTES, MARKDOWN_SOFT_LIMIT_BYTES } from '@nothingleft/types';

export type MarkdownSizeLevel = 'ok' | 'warning' | 'too_large';

export interface MarkdownSize {
  bytes: number;
  level: MarkdownSizeLevel;
}

const encoder = new TextEncoder();

export function markdownByteLength(markdown: string): number {
  return encoder.encode(markdown).byteLength;
}

export function checkMarkdownSize(markdown: string): MarkdownSize {
  const bytes = markdownByteLength(markdown);
  if (bytes > MARKDOWN_HARD_LIMIT_BYTES) return { bytes, level: 'too_large' };
  if (bytes >= MARKDOWN_SOFT_LIMIT_BYTES) return { bytes, level: 'warning' };
  return { bytes, level: 'ok' };
}
