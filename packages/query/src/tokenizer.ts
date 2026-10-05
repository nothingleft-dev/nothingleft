import type { ErrorCode } from '@nothingleft/i18n';

export interface Span {
  start: number;
  end: number;
}

export type Token = Span &
  (
    | { type: 'word'; value: string; colon: boolean }
    | { type: 'brace'; value: string; closed: boolean }
    | { type: 'quote'; value: string; closed: boolean }
    | { type: 'comma' }
    | { type: 'range' }
    | { type: 'hash' }
    | { type: 'minus' }
  );

export class QueryError extends Error {
  readonly span: Span;

  constructor(
    readonly code: Extract<ErrorCode, `query.${string}`>,
    span: Span,
    readonly params: Record<string, string | number> = {},
    readonly validValues?: string[],
  ) {
    super(code);
    this.span = { start: span.start, end: span.end };
  }
}

const WORD_BREAK = new Set([' ', '\t', '\n', '\r', ',', '{', '}', '"', ':']);

export interface TokenizeOptions {
  /** Keep going past an unterminated brace or quote; the suggestion engine needs a half-typed query. */
  lenient?: boolean;
}

export function tokenize(input: string, options: TokenizeOptions = {}): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const readBraced = (start: number): Token => {
    let depth = 1;
    let j = start + 1;
    while (j < input.length && depth > 0) {
      const ch = input[j];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      j += 1;
    }
    const closed = depth === 0;
    if (!closed && !options.lenient) throw new QueryError('query.unbalanced_braces', { start, end: input.length });
    const value = input.slice(start + 1, closed ? j - 1 : j);
    return { type: 'brace', value, closed, start, end: j };
  };

  const readQuoted = (start: number): Token => {
    const close = input.indexOf('"', start + 1);
    const closed = close !== -1;
    if (!closed && !options.lenient) throw new QueryError('query.unterminated_quote', { start, end: input.length });
    const end = closed ? close + 1 : input.length;
    return { type: 'quote', value: input.slice(start + 1, closed ? close : input.length), closed, start, end };
  };

  while (i < input.length) {
    const ch = input[i] as string;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
    } else if (ch === ',') {
      tokens.push({ type: 'comma', start: i, end: i + 1 });
      i += 1;
    } else if (ch === '{') {
      const token = readBraced(i);
      tokens.push(token);
      i = token.end;
    } else if (ch === '}') {
      if (!options.lenient) throw new QueryError('query.unbalanced_braces', { start: i, end: i + 1 });
      i += 1;
    } else if (ch === '"') {
      const token = readQuoted(i);
      tokens.push(token);
      i = token.end;
    } else if (ch === '.' && input[i + 1] === '.') {
      tokens.push({ type: 'range', start: i, end: i + 2 });
      i += 2;
    } else if (ch === '#') {
      tokens.push({ type: 'hash', start: i, end: i + 1 });
      i += 1;
    } else if (ch === '-' && input[i + 1] === '{') {
      tokens.push({ type: 'minus', start: i, end: i + 1 });
      i += 1;
    } else if (ch === ':') {
      // A stray colon (not glued to a word) is free text.
      tokens.push({ type: 'word', value: ':', colon: false, start: i, end: i + 1 });
      i += 1;
    } else {
      const start = i;
      while (i < input.length && !WORD_BREAK.has(input[i] as string) && !(input[i] === '.' && input[i + 1] === '.')) {
        i += 1;
      }
      const value = input.slice(start, i);
      const colon = input[i] === ':';
      if (colon) i += 1;
      tokens.push({ type: 'word', value, colon, start, end: i });
    }
  }
  return tokens;
}
