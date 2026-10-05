import type { MarkdownSize } from '@nothingleft/markdown';
import { MARKDOWN_HARD_LIMIT_BYTES } from '@nothingleft/types';

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

/** Silent under 64 KB; a warning from there, and a blocker past the 256 KB the API refuses. */
export function MarkdownSizeNote({ size }: { size: MarkdownSize }) {
  if (size.level === 'ok') return null;
  return size.level === 'warning' ? (
    <p role="status" className="text-xs text-warning-fg">
      This is getting long: {kb(size.bytes)} of {kb(MARKDOWN_HARD_LIMIT_BYTES)}. It still saves.
    </p>
  ) : (
    <p role="alert" className="text-xs text-danger-fg">
      {kb(size.bytes)} is over the {kb(MARKDOWN_HARD_LIMIT_BYTES)} limit. Shorten it to save.
    </p>
  );
}
