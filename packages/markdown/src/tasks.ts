import type { ListItem } from 'mdast';
import { visit } from 'unist-util-visit';
import { parseMarkdown } from './parse.ts';

const TASK_MARKER = /^([-*+]|\d+[.)])(\s+)\[([ xX])\]/;

/** Rewrites the nth task checkbox (document order, as `data-task` numbers them) in the source. */
export function toggleTaskItem(markdown: string, index: number, checked: boolean): string {
  let seen = 0;
  let offset: number | null = null;
  visit(parseMarkdown(markdown), 'listItem', (node: ListItem) => {
    if (node.checked === null || node.checked === undefined) return;
    if (seen === index) offset = node.position?.start.offset ?? null;
    seen += 1;
  });
  if (offset === null) return markdown;

  const match = TASK_MARKER.exec(markdown.slice(offset));
  if (!match) return markdown;
  const [, marker, gap] = match as unknown as [string, string, string, string];
  const boxStart = offset + marker.length + gap.length + 1;
  return `${markdown.slice(0, boxStart)}${checked ? 'x' : ' '}${markdown.slice(boxStart + 1)}`;
}
