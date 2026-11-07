export type SegmentKind = 'attribute' | 'value' | 'text';

export interface Segment {
  text: string;
  kind: SegmentKind;
  /** Inside the span the API flagged. */
  error: boolean;
}

// The multi-word attribute names of docs/search-query-language.md. Display only: the
// parser decides what a query means, this decides what is set in secondary ink.
const MULTI_WORD = [
  'aggregate [a-z]+(?: [a-z]+)*',
  'created by',
  'updated by',
  'work author',
  'work type',
  'due date',
  'start date',
  'resolved date',
  'sort by',
  'story points',
  'spent time',
  'subtask of',
  'parent for',
  'relates to',
  'depends on',
  'is required for',
  'is duplicated by',
];

const ATTRIBUTE = new RegExp(`(?:${MULTI_WORD.join('|')}|[a-z][\\w-]*):`, 'gi');
const SHORTHAND = /#(?:\{[^}]*\}?|[^\s,()]+)/g;
const OPERATOR = /(?<=^|[\s()])(?:or|and)(?=[\s()]|$)|[()]/gi;
// Where a value stops: the next attribute, shorthand, operator or closing parenthesis.
const VALUE_END = new RegExp(
  `(?:^|[\\s(])(?:${MULTI_WORD.join('|')}|[a-z][\\w-]*):|(?:^|[\\s(])#|\\)|\\s(?:or|and)(?=[\\s(]|$)`,
  'gi',
);

interface Span {
  start: number;
  end: number;
}

function markKinds(text: string): SegmentKind[] {
  const kinds: SegmentKind[] = Array.from(text, () => 'text');
  const paint = (start: number, end: number, kind: SegmentKind) => {
    for (let i = start; i < end && i < kinds.length; i++) kinds[i] = kind;
  };
  const braced = Array.from(text, () => false);
  for (let i = 0, depth = 0; i < text.length; i++) {
    if (text[i] === '{') depth++;
    braced[i] = depth > 0;
    if (text[i] === '}' && depth > 0) depth--;
  }
  for (const match of text.matchAll(ATTRIBUTE)) {
    const start = match.index;
    if (braced[start] || (start > 0 && !/[\s(]/.test(text[start - 1]!))) continue;
    paint(start, start + match[0].length, 'attribute');
    const from = start + match[0].length;
    let end = text.length;
    for (const stop of text.slice(from).matchAll(VALUE_END)) {
      if (braced[from + stop.index]) continue;
      end = from + stop.index;
      break;
    }
    paint(from, end, 'value');
  }
  for (const match of text.matchAll(SHORTHAND)) {
    const start = match.index;
    if (braced[start] || (start > 0 && !/[\s(]/.test(text[start - 1]!))) continue;
    paint(start, start + match[0].length, 'attribute');
  }
  for (const match of text.matchAll(OPERATOR)) {
    if (!braced[match.index]) paint(match.index, match.index + match[0].length, 'attribute');
  }
  return kinds;
}

/** Splits a query into runs of one kind, cut again at the error span's edges. */
export function highlightQuery(text: string, error: Span | null): Segment[] {
  const kinds = markKinds(text);
  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const kind = kinds[i]!;
    const inError = error !== null && i >= error.start && i < error.end;
    const last = segments.at(-1);
    if (last && last.kind === kind && last.error === inError) last.text += text[i];
    else segments.push({ text: text[i]!, kind, error: inError });
  }
  return segments;
}
