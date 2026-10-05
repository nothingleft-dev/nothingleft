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
const SHORTHAND = /#(?:\{[^}]*\}?|[^\s,]+)/g;

interface Span {
  start: number;
  end: number;
}

function markKinds(text: string): SegmentKind[] {
  const kinds: SegmentKind[] = Array.from(text, () => 'text');
  const paint = (start: number, end: number, kind: SegmentKind) => {
    for (let i = start; i < end && i < kinds.length; i++) kinds[i] = kind;
  };
  for (const match of text.matchAll(ATTRIBUTE)) {
    const start = match.index;
    if (start > 0 && !/\s/.test(text[start - 1]!)) continue;
    paint(start, start + match[0].length, 'attribute');
    // Everything up to the next attribute or shorthand is that attribute's value.
    let end = text.length;
    const rest = text.slice(start + match[0].length);
    const next = rest.search(new RegExp(`(?:^|\\s)(?:${MULTI_WORD.join('|')}|[a-z][\\w-]*):|(?:^|\\s)#`, 'i'));
    if (next >= 0) end = start + match[0].length + next;
    paint(start + match[0].length, end, 'value');
  }
  for (const match of text.matchAll(SHORTHAND)) {
    const start = match.index;
    if (start > 0 && !/\s/.test(text[start - 1]!)) continue;
    paint(start, start + match[0].length, 'attribute');
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
