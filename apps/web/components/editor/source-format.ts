export interface SourceEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

interface Selection {
  value: string;
  start: number;
  end: number;
}

export function wrapInline(
  { value, start, end }: Selection,
  before: string,
  after: string,
  fallback: string,
): SourceEdit {
  const inner = value.slice(start, end) || fallback;
  const text = value.slice(0, start) + before + inner + after + value.slice(end);
  return { text, selectionStart: start + before.length, selectionEnd: start + before.length + inner.length };
}

export const linkInline = (selection: Selection, url: string): SourceEdit =>
  wrapInline(selection, '[', `](${url})`, url);

const lineStart = (value: string, at: number) => value.lastIndexOf('\n', at - 1) + 1;

const HEADING = /^#{1,6}\s+/;
const LIST = /^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/;

/** Prefixes every selected line; a line that already carries the same prefix loses it instead. */
export function prefixLines(
  { value, start, end }: Selection,
  prefix: string | ((index: number) => string),
): SourceEdit {
  const from = lineStart(value, start);
  const block = value.slice(from, end);
  const lines = block.split('\n');
  const prefixOf = (i: number) => (typeof prefix === 'string' ? prefix : prefix(i));
  const allHave = lines.every((line, i) => line.startsWith(prefixOf(i)));
  const next = lines
    .map((line, i) => {
      if (allHave) return line.slice(prefixOf(i).length);
      const bare = line.replace(HEADING, '').replace(LIST, '$1');
      return prefixOf(i) + bare;
    })
    .join('\n');
  const text = value.slice(0, from) + next + value.slice(end);
  return { text, selectionStart: from, selectionEnd: from + next.length };
}

export function insertBlock({ value, start, end }: Selection, block: string, cursorOffset: number): SourceEdit {
  const before = value.slice(0, start);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const text = before + lead + block + '\n' + value.slice(end);
  const at = start + lead.length + cursorOffset;
  return { text, selectionStart: at, selectionEnd: at };
}

export const TABLE_TEMPLATE = '| Column | Column |\n| --- | --- |\n|  |  |';

export function codeFence(selection: Selection): SourceEdit {
  const inner = selection.value.slice(selection.start, selection.end);
  return insertBlock(selection, '```\n' + inner + '\n```', 4);
}

export function currentBlockType(value: string, caret: number): 'paragraph' | 'h1' | 'h2' | 'h3' {
  const line = value.slice(lineStart(value, caret)).split('\n')[0] ?? '';
  const match = /^(#{1,3})\s/.exec(line);
  if (!match) return 'paragraph';
  return `h${match[1]!.length}` as 'h1' | 'h2' | 'h3';
}

const TRIGGER = /(?:^|\s)([@#])([\w.-]{0,40})$/;

/** A `@name` or `#query` being typed right before the caret, if any. */
export function triggerBefore(
  value: string,
  caret: number,
): { trigger: '@' | '#'; query: string; from: number } | null {
  const match = TRIGGER.exec(value.slice(Math.max(0, caret - 48), caret));
  if (!match) return null;
  const query = match[2] ?? '';
  return { trigger: match[1] as '@' | '#', query, from: caret - query.length - 1 };
}
