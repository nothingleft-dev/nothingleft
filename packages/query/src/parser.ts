import { parseDuration, parseIssueKey } from '@nothingleft/format';
import type { Bound, Clause, DateKeyword, DateUnit, Query, ScalarValue, SortKey, Value, Weekday } from './ast.ts';
import type { AttributeDefinition, Registry } from './registry/registry.ts';
import { QueryError, tokenize, type Span, type Token } from './tokenizer.ts';

export interface ClauseSpan extends Span {
  /** Where the value list starts, for attribute-like clauses. */
  valueStart?: number;
}

export interface ParseResult {
  query: Query;
  spans: ClauseSpan[];
}

const DATE_KEYWORDS: readonly DateKeyword[] = [
  'today',
  'yesterday',
  'tomorrow',
  'now',
  'this week',
  'last week',
  'next week',
  'this month',
  'last month',
  'next month',
  'this year',
  'last year',
  'next year',
];

const WEEKDAYS: readonly string[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const RELATIVE = /^(minus|plus)\s+(\d+)([mhdwMy])$/;
const DIRECTIONS = new Set(['asc', 'desc']);

const normalise = (text: string) => text.trim().replace(/\s+/g, ' ');

export function parseDateValue(raw: string): Bound | null {
  const text = normalise(raw);
  const lower = text.toLowerCase();
  if (ISO_DATE.test(text)) return { kind: 'date', date: text };
  if (ISO_MONTH.test(text)) return { kind: 'month', month: text };
  if ((DATE_KEYWORDS as readonly string[]).includes(lower)) return { kind: 'keyword', keyword: lower as DateKeyword };
  const weekday = WEEKDAYS.indexOf(lower);
  if (weekday !== -1) return { kind: 'weekday', weekday: (weekday + 1) as Weekday };
  const relative = RELATIVE.exec(text);
  if (relative) {
    const [, direction, amount, unit] = relative as unknown as [string, string, string, DateUnit];
    return { kind: 'relative', sign: direction === 'minus' ? -1 : 1, amount: Number(amount), unit };
  }
  return null;
}

interface RawValue {
  text: string;
  braced: boolean;
  span: Span;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly registry: Registry,
    private readonly input: string,
  ) {}

  parse(): ParseResult {
    const clauses: Clause[] = [];
    const spans: ClauseSpan[] = [];
    while (this.index < this.tokens.length) {
      const start = this.index;
      const clause = this.clause();
      clauses.push(clause.clause);
      spans.push({
        start: (this.tokens[start] as Token).start,
        end: (this.tokens[this.index - 1] as Token).end,
        ...(clause.valueStart === undefined ? {} : { valueStart: clause.valueStart }),
      });
    }
    return { query: { clauses }, spans };
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (!token) throw new QueryError('query.unexpected_end', { start: this.input.length, end: this.input.length });
    this.index += 1;
    return token;
  }

  private clause(): { clause: Clause; valueStart?: number } {
    const token = this.peek() as Token;

    if (token.type === 'hash') return { clause: this.shorthand() };

    if (token.type === 'word') {
      const head = this.attributeHead();
      if (head) return head;
      this.index += 1;
      return { clause: { kind: 'text', text: token.value, phrase: false } };
    }

    this.index += 1;
    if (token.type === 'quote' || token.type === 'brace') {
      return { clause: { kind: 'text', text: token.value, phrase: true } };
    }
    if (token.type === 'minus') {
      const brace = this.next();
      if (brace.type !== 'brace') throw new QueryError('query.unexpected_token', brace, { token: '-' });
      return { clause: { kind: 'text', text: `-${brace.value}`, phrase: true } };
    }
    throw new QueryError('query.unexpected_token', token, { token: this.input.slice(token.start, token.end) });
  }

  /**
   * Words up to the first colon-bearing word may name an attribute (`created by:`),
   * a link (`subtask of:`) or an aggregate (`aggregate Subtask of:`). The longest
   * registered suffix wins; leading words that are not part of it are free text.
   */
  private attributeHead(): { clause: Clause; valueStart?: number } | null {
    const limit = Math.min(this.tokens.length, this.index + this.registry.maxWords);
    let colonAt = -1;
    for (let j = this.index; j < limit; j += 1) {
      const token = this.tokens[j] as Token;
      if (token.type !== 'word') break;
      if (token.colon) {
        colonAt = j;
        break;
      }
    }
    if (colonAt === -1) return null;

    for (let k = this.index; k <= colonAt; k += 1) {
      const words = this.tokens.slice(k, colonAt + 1).map(token => (token as { value: string }).value);
      const name = normalise(words.join(' ')).toLowerCase();
      const resolved = this.resolveHead(name, k, colonAt);
      if (resolved) {
        if (k !== this.index) return null;
        return resolved();
      }
    }

    if (colonAt !== this.index) return null;
    const token = this.tokens[colonAt] as Token & { type: 'word' };
    throw new QueryError(
      'query.unknown_attribute',
      token,
      { attribute: token.value },
      this.registry.attributes.map(attribute => attribute.name),
    );
  }

  private resolveHead(
    name: string,
    from: number,
    colonAt: number,
  ): (() => { clause: Clause; valueStart?: number }) | null {
    const attribute = this.registry.attribute(name);
    if (attribute) {
      return () => {
        this.index = colonAt + 1;
        return this.attributeClause(attribute, (this.tokens[colonAt] as Token).end);
      };
    }
    const link = this.registry.link(name);
    if (link) {
      return () => {
        this.index = colonAt + 1;
        const valueStart = (this.tokens[colonAt] as Token).end;
        return { clause: { kind: 'link', link: link.name, values: this.values(v => this.keyValue(v)) }, valueStart };
      };
    }
    const first = this.tokens[from] as Token & { type: 'word' };
    if (first.value.toLowerCase() === 'aggregate' && colonAt > from) {
      const linkName = name.slice('aggregate '.length);
      return () => {
        this.index = colonAt + 1;
        const aggregateLink = this.registry.link(linkName);
        if (!aggregateLink) {
          throw new QueryError(
            'query.unknown_link',
            { start: first.start, end: (this.tokens[colonAt] as Token).end },
            { link: linkName },
            this.registry.links.map(link => link.name),
          );
        }
        const body = this.peek();
        if (!body || body.type !== 'brace') {
          throw new QueryError(
            'query.expected_subquery',
            body ?? { start: this.input.length, end: this.input.length },
            {
              link: aggregateLink.name,
            },
          );
        }
        this.index += 1;
        const nested = parse(body.value, this.registry);
        return { clause: { kind: 'aggregate', link: aggregateLink.name, query: nested.query }, valueStart: body.start };
      };
    }
    return null;
  }

  private shorthand(): Clause {
    const hash = this.next();
    const token = this.peek();
    if (!token || (token.type !== 'word' && token.type !== 'brace') || (token.type === 'word' && token.colon)) {
      throw new QueryError('query.missing_value', hash, { attribute: '#' });
    }
    this.index += 1;
    const value = normalise(token.value);
    const lower = value.toLowerCase();
    if (this.registry.categories.includes(lower)) {
      return { kind: 'category', category: lower === 'star' ? 'starred' : (lower as 'resolved' | 'unresolved') };
    }
    return { kind: 'shorthand', value };
  }

  private attributeClause(attribute: AttributeDefinition, valueStart: number): { clause: Clause; valueStart: number } {
    switch (attribute.type) {
      case 'sort':
        return { clause: { kind: 'sort', keys: this.sortKeys(attribute) }, valueStart };
      case 'has':
        return {
          clause: {
            kind: 'attribute',
            attribute: attribute.name,
            values: this.values(v => this.attributeNameValue(v)),
          },
          valueStart,
        };
      default:
        return {
          clause: { kind: 'attribute', attribute: attribute.name, values: this.values(v => this.scalar(attribute, v)) },
          valueStart,
        };
    }
  }

  private startsValue(token: Token | undefined): boolean {
    if (!token) return false;
    if (token.type === 'word') return !token.colon && !this.startsAttribute();
    return token.type === 'brace' || token.type === 'quote' || token.type === 'minus' || token.type === 'range';
  }

  /** True when the tokens at the cursor begin an attribute head, so a bare word there is not a value. */
  private startsAttribute(): boolean {
    const saved = this.index;
    try {
      return this.attributeHead() !== null;
    } catch {
      return true;
    } finally {
      this.index = saved;
    }
  }

  private values(scalar: (raw: RawValue) => ScalarValue | Bound): Value[] {
    const values: Value[] = [];
    const attributeToken = this.tokens[this.index - 1] as Token;
    if (!this.startsValue(this.peek())) {
      throw new QueryError('query.missing_value', attributeToken, {
        attribute: this.input.slice(attributeToken.start, attributeToken.end),
      });
    }
    for (;;) {
      values.push(this.value(scalar));
      const separator = this.peek();
      if (!separator || separator.type !== 'comma') break;
      this.index += 1;
      if (!this.startsValue(this.peek())) throw new QueryError('query.missing_value', separator, { attribute: ',' });
    }
    return values;
  }

  private value(scalar: (raw: RawValue) => ScalarValue | Bound): Value {
    let negated = false;
    const first = this.peek() as Token;

    if (first.type === 'range') {
      this.index += 1;
      const to = this.bound(scalar);
      if (to === null) throw new QueryError('query.invalid_range', first);
      return { kind: 'range', from: null, to, negated };
    }

    let raw: RawValue;
    if (first.type === 'minus') {
      this.index += 1;
      negated = true;
      const brace = this.next();
      if (brace.type !== 'brace') throw new QueryError('query.unexpected_token', brace, { token: '-' });
      raw = { text: brace.value, braced: true, span: { start: first.start, end: brace.end } };
    } else {
      this.index += 1;
      raw = this.rawValue(first);
      if (!raw.braced && raw.text.startsWith('-')) {
        if (raw.text.length === 1)
          throw new QueryError('query.invalid_value', raw.span, { attribute: '-', value: '-' });
        negated = true;
        raw = { ...raw, text: raw.text.slice(1) };
      }
    }

    const open = !raw.braced && raw.text === '*';
    if (this.peek()?.type === 'range') {
      this.index += 1;
      const from = open ? null : this.asBound(scalar, raw);
      const to = this.bound(scalar);
      if (from === null && to === null) throw new QueryError('query.invalid_range', raw.span);
      return { kind: 'range', from, to, negated };
    }
    if (open) throw new QueryError('query.invalid_range', raw.span);
    return { ...scalar(raw), negated } as Value;
  }

  private bound(scalar: (raw: RawValue) => ScalarValue | Bound): Bound | null {
    const token = this.peek();
    if (!token || token.type === 'comma' || token.type === 'range' || token.type === 'hash' || token.type === 'minus') {
      return null;
    }
    if (token.type === 'word' && (token.colon || this.startsAttribute())) return null;
    this.index += 1;
    const raw = this.rawValue(token);
    if (!raw.braced && raw.text === '*') return null;
    return this.asBound(scalar, raw);
  }

  private asBound(scalar: (raw: RawValue) => ScalarValue | Bound, raw: RawValue): Bound {
    const value = scalar(raw);
    if (isBound(value)) return value;
    throw new QueryError('query.invalid_range', raw.span);
  }

  private rawValue(token: Token): RawValue {
    switch (token.type) {
      case 'word':
        return { text: token.value, braced: false, span: token };
      case 'brace':
      case 'quote':
        return { text: token.value, braced: true, span: token };
      default:
        throw new QueryError('query.unexpected_token', token, { token: this.input.slice(token.start, token.end) });
    }
  }

  private scalar(attribute: AttributeDefinition, raw: RawValue): ScalarValue | Bound {
    const text = normalise(raw.text);
    const lower = text.toLowerCase();
    if (attribute.empty && lower === attribute.empty.toLowerCase()) return { kind: 'empty' };
    const invalid = () => new QueryError('query.invalid_value', raw.span, { attribute: attribute.name, value: text });

    switch (attribute.type) {
      case 'user':
        return lower === 'me' ? { kind: 'me' } : { kind: 'literal', value: text };
      case 'enum':
        if (attribute.name === 'status' && (lower === 'resolved' || lower === 'unresolved')) {
          return { kind: 'category', category: lower };
        }
        return { kind: 'literal', value: text };
      case 'project':
      case 'text':
        return { kind: 'literal', value: text };
      case 'key': {
        const key = parseIssueKey(text);
        if (!key) throw invalid();
        return { kind: 'key', key: `${key.projectKey}-${key.number}` };
      }
      case 'instant':
      case 'date': {
        const date = parseDateValue(text);
        if (!date) throw invalid();
        return date;
      }
      case 'number': {
        // A leading `-` is negation, so a negative number is only reachable braced: `{-5}`.
        if (!(raw.braced ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/).test(text)) throw invalid();
        return { kind: 'number', value: Number(text) };
      }
      case 'boolean': {
        if (lower === 'yes' || lower === 'true') return { kind: 'literal', value: 'yes' };
        if (lower === 'no' || lower === 'false') return { kind: 'literal', value: 'no' };
        throw new QueryError('query.invalid_value', raw.span, { attribute: attribute.name, value: text }, [
          'Yes',
          'No',
        ]);
      }
      case 'duration': {
        if (parseDuration(text) === null) throw invalid();
        return { kind: 'duration', raw: text };
      }
      default:
        throw invalid();
    }
  }

  private keyValue(raw: RawValue): ScalarValue {
    const key = parseIssueKey(raw.text);
    if (!key) throw new QueryError('query.invalid_value', raw.span, { attribute: 'key', value: raw.text });
    return { kind: 'key', key: `${key.projectKey}-${key.number}` };
  }

  private attributeNameValue(raw: RawValue): ScalarValue {
    const name = normalise(raw.text).toLowerCase();
    if (!this.registry.existence.includes(name)) {
      throw new QueryError('query.unknown_attribute', raw.span, { attribute: raw.text }, [...this.registry.existence]);
    }
    return { kind: 'attribute', attribute: name };
  }

  private sortKeys(sortBy: AttributeDefinition): SortKey[] {
    const keys: SortKey[] = [];
    const attributeToken = this.tokens[this.index - 1] as Token;
    if (!this.startsValue(this.peek())) {
      throw new QueryError('query.missing_value', attributeToken, { attribute: sortBy.name });
    }
    for (;;) {
      const token = this.next();
      const raw = this.rawValue(token);
      const name = normalise(raw.text).toLowerCase();
      const attribute = this.registry.attribute(name);
      if (!attribute || !attribute.sortable) {
        throw new QueryError(
          'query.not_sortable',
          raw.span,
          { attribute: raw.text },
          this.registry.attributes.filter(a => a.sortable).map(a => a.name),
        );
      }
      let direction: SortKey['direction'] = 'asc';
      const next = this.peek();
      if (next?.type === 'word' && !next.colon && DIRECTIONS.has(next.value.toLowerCase())) {
        direction = next.value.toLowerCase() as SortKey['direction'];
        this.index += 1;
      }
      keys.push({ attribute: attribute.name, direction });
      if (this.peek()?.type !== 'comma') break;
      this.index += 1;
      if (!this.startsValue(this.peek())) throw new QueryError('query.missing_value', token, { attribute: ',' });
    }
    return keys;
  }
}

function isBound(value: ScalarValue | Bound): value is Bound {
  return (
    value.kind === 'number' ||
    value.kind === 'duration' ||
    value.kind === 'date' ||
    value.kind === 'month' ||
    value.kind === 'keyword' ||
    value.kind === 'weekday' ||
    value.kind === 'relative'
  );
}

/** Query text → AST. Throws `QueryError` with a catalogue code and the offending span. */
export function parse(input: string, registry: Registry): ParseResult {
  return new Parser(tokenize(input), registry, input).parse();
}
