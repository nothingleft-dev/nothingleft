import type { DateKeyword, Weekday } from './ast.ts';
import { type DateContext, resolveDatePeriod } from './dates.ts';
import type { AttributeDefinition, Label, Registry } from './registry/registry.ts';
import { type Span, type Token, tokenize } from './tokenizer.ts';

export interface ValueCandidate {
  value: string;
  /** Overrides the attribute's group label, e.g. a user's display name group. */
  group?: Label;
}

type MaybePromise<T> = T | Promise<T>;

export interface ValueProvider {
  /** Values of an enum-like attribute matching `prefix` (case-insensitive, any word). */
  values(attribute: AttributeDefinition, prefix: string): MaybePromise<readonly ValueCandidate[]>;
  savedSearches?(prefix: string): MaybePromise<readonly string[]>;
  recentSearches?(prefix: string): MaybePromise<readonly string[]>;
}

export type SuggestionKind = 'attribute' | 'value' | 'operator' | 'saved_search' | 'recent_search';

export interface Suggestion {
  kind: SuggestionKind;
  /** What the dropdown shows. */
  label: string;
  /** Replaces `replace` in the query text. */
  insert: string;
  replace: Span;
  description?: Label;
}

export interface SuggestOptions extends DateContext {
  /** Attribute names typed in the query so far, to hide `sort by:` after it is used. */
  maxValues?: number;
}

const NEEDS_BRACES = /[\s,:{}"#]|^-|^\*$|\.\./;
const braced = (text: string) => (NEEDS_BRACES.test(text) ? `{${text}}` : text);

function wordPrefixMatch(candidate: string, prefix: string): boolean {
  if (!prefix) return true;
  const needle = prefix.toLowerCase();
  const haystack = candidate.toLowerCase();
  if (haystack.startsWith(needle)) return true;
  return haystack.split(/[^a-z0-9]+/).some(part => part.startsWith(needle));
}

type Context =
  | { kind: 'clause'; prefix: string; hash: boolean; replace: Span }
  | { kind: 'value'; attribute: AttributeDefinition; prefix: string; negated: boolean; replace: Span }
  | { kind: 'sort_direction'; replace: Span; prefix: string };

function headAt(tokens: Token[], index: number, registry: Registry): AttributeDefinition | 'link' | null {
  const colon = tokens[index];
  if (!colon || colon.type !== 'word' || !colon.colon) return null;
  for (let k = Math.max(0, index - registry.maxWords + 1); k <= index; k += 1) {
    const words = tokens.slice(k, index + 1);
    if (!words.every(token => token.type === 'word' && (token === colon || !token.colon))) continue;
    const name = words
      .map(token => (token as { value: string }).value)
      .join(' ')
      .toLowerCase();
    const attribute = registry.attribute(name);
    if (attribute) return attribute;
    if (registry.link(name)) return 'link';
  }
  return null;
}

function contextAt(query: string, caret: number, registry: Registry): Context {
  const tokens = tokenize(query, { lenient: true });
  const current = tokens.find(token => token.start < caret && caret <= token.end);
  const before = tokens.filter(token => token.end <= caret && token !== current);
  const replace: Span = current ? { start: current.start, end: current.end } : { start: caret, end: caret };

  let expecting: AttributeDefinition | 'link' | null = null;
  let afterSortKey = false;
  for (let i = 0; i < before.length; i += 1) {
    const token = before[i] as Token;
    const head = headAt(before, i, registry);
    if (head) {
      expecting = head;
      afterSortKey = false;
    } else if (token.type === 'comma') {
      if (afterSortKey) afterSortKey = false;
    } else if (token.type === 'minus' || token.type === 'range' || token.type === 'hash') {
      // still inside the value being built
    } else if (expecting) {
      const next = before[i + 1];
      if (typeof expecting !== 'string' && expecting.type === 'sort' && !afterSortKey) {
        afterSortKey = true;
        if (!next || next.type !== 'comma') continue;
      }
      if (!next || next.type !== 'comma') {
        expecting = null;
        afterSortKey = false;
      }
    }
  }

  if (current?.type === 'word' && current.colon)
    return { kind: 'clause', prefix: '', hash: false, replace: { start: caret, end: caret } };

  const typed = current ? query.slice(current.start, caret) : '';
  if (expecting === 'link') {
    return {
      kind: 'value',
      attribute: { name: 'key', type: 'key', description: { key: 'query.attribute.key' } },
      prefix: typed,
      negated: false,
      replace,
    };
  }
  if (expecting) {
    if (expecting.type === 'sort' && afterSortKey && !(current?.type === 'comma')) {
      return { kind: 'sort_direction', replace, prefix: typed };
    }
    const negated = typed.startsWith('-');
    const prefix = typed.replace(/^-/, '').replace(/^\{/, '');
    return { kind: 'value', attribute: expecting, prefix, negated, replace };
  }

  const previous = before[before.length - 1];
  const hash = current?.type === 'hash' || (previous?.type === 'hash' && previous.end === (current?.start ?? caret));
  if (hash && previous?.type === 'hash') replace.start = previous.start;
  const prefix = typed.replace(/^#/, '').replace(/^\{/, '');
  return { kind: 'clause', prefix, hash, replace };
}

const DATE_KEYWORDS: readonly DateKeyword[] = [
  'today',
  'tomorrow',
  'yesterday',
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
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function dateSuggestions(context: Extract<Context, { kind: 'value' }>, options: SuggestOptions): Suggestion[] {
  const sign = context.negated ? '-' : '';
  const out: Suggestion[] = [];
  const push = (label: string, description: Label) => {
    if (!wordPrefixMatch(label, context.prefix)) return;
    out.push({ kind: 'value', label, insert: `${sign}${label} `, replace: context.replace, description });
  };
  const month = options.today.slice(0, 7);
  push(month, { key: 'query.suggest.month' });
  for (const keyword of DATE_KEYWORDS) {
    const period = resolveDatePeriod({ kind: 'keyword', keyword }, options);
    if (!period) continue;
    push(
      braced(capitalise(keyword)),
      period.start === period.end
        ? { key: 'query.suggest.day', params: { date: period.start } }
        : { key: 'query.suggest.period', params: { from: period.start, to: period.end } },
    );
  }
  WEEKDAY_NAMES.forEach((name, index) => {
    const period = resolveDatePeriod({ kind: 'weekday', weekday: (index + 1) as Weekday }, options);
    if (period) push(name, { key: 'query.suggest.day', params: { date: period.start } });
  });
  return out;
}

async function valueSuggestions(
  context: Extract<Context, { kind: 'value' }>,
  registry: Registry,
  provider: ValueProvider,
  options: SuggestOptions,
): Promise<Suggestion[]> {
  const { attribute, prefix, negated, replace } = context;
  const sign = negated ? '-' : '';
  const out: Suggestion[] = [];
  const value = (label: string, description?: Label): Suggestion => ({
    kind: 'value',
    label: `${sign}${braced(label)}`,
    insert: `${sign}${braced(label)} `,
    replace,
    ...(description ? { description } : {}),
  });

  if (!prefix && !negated) {
    out.push({ kind: 'operator', label: '-', insert: '-', replace, description: { key: 'query.suggest.exclude' } });
    if (attribute.empty) {
      out.push({
        kind: 'value',
        label: braced(attribute.empty),
        insert: `${braced(attribute.empty)} `,
        replace,
        description: { key: 'query.suggest.empty', params: { attribute: attribute.name } },
      });
    }
    if (['number', 'duration', 'date', 'instant'].includes(attribute.type)) {
      out.push({
        kind: 'operator',
        label: '..',
        insert: '.. ',
        replace,
        description: { key: 'query.suggest.open_range' },
      });
    }
  }

  switch (attribute.type) {
    case 'date':
    case 'instant':
      return [...out, ...dateSuggestions(context, options)];
    case 'has':
      for (const name of registry.existence) {
        if (!wordPrefixMatch(name, prefix)) continue;
        const candidate = registry.attribute(name);
        out.push(value(name, candidate?.description));
      }
      return out;
    case 'sort':
      for (const candidate of registry.attributes) {
        if (!candidate.sortable || !wordPrefixMatch(candidate.name, prefix)) continue;
        out.push(value(candidate.name, candidate.description));
      }
      return out;
    case 'user':
      if (wordPrefixMatch('me', prefix)) out.push(value('me', { key: 'query.suggest.me' }));
      break;
    case 'boolean':
      for (const answer of ['Yes', 'No']) if (wordPrefixMatch(answer, prefix)) out.push(value(answer));
      return out;
    default:
      break;
  }

  if (['enum', 'user', 'project', 'text', 'key'].includes(attribute.type)) {
    for (const candidate of await provider.values(attribute, prefix)) {
      out.push(value(candidate.value, candidate.group ?? attribute.group));
    }
  }
  return out;
}

async function clauseSuggestions(
  context: Extract<Context, { kind: 'clause' }>,
  registry: Registry,
  provider: ValueProvider,
  query: string,
): Promise<Suggestion[]> {
  const { prefix, hash, replace } = context;
  const out: Suggestion[] = [];

  if (!hash) {
    for (const attribute of registry.attributes) {
      if (!wordPrefixMatch(attribute.name, prefix)) continue;
      out.push({
        kind: 'attribute',
        label: `${attribute.name}:`,
        insert: `${attribute.name}: `,
        replace,
        description: attribute.description,
      });
    }
    for (const link of registry.links) {
      const description: Label = { key: 'query.attribute.link', params: { link: link.type } };
      if (wordPrefixMatch(link.name, prefix)) {
        out.push({ kind: 'attribute', label: `${link.name}:`, insert: `${link.name}: `, replace, description });
      }
      const aggregate = `aggregate ${link.name}`;
      if (wordPrefixMatch(aggregate, prefix)) {
        out.push({ kind: 'attribute', label: `${aggregate}:`, insert: `${aggregate}: {`, replace, description });
      }
    }
  }

  for (const category of registry.categories) {
    if (!wordPrefixMatch(category, prefix)) continue;
    const label = `#${capitalise(category)}`;
    out.push({ kind: 'value', label, insert: `${label} `, replace, description: { key: 'query.group.category' } });
  }
  for (const attribute of registry.attributes) {
    if (!attribute.shorthand) continue;
    for (const candidate of await provider.values(attribute, prefix)) {
      const label = `#${braced(candidate.value)}`;
      const description = candidate.group ?? attribute.group;
      out.push({ kind: 'value', label, insert: `${label} `, replace, ...(description ? { description } : {}) });
    }
  }
  for (const saved of (await provider.savedSearches?.(prefix)) ?? []) {
    const label = `#{${saved}}`;
    out.push({
      kind: 'saved_search',
      label,
      insert: `${label} `,
      replace,
      description: { key: 'query.group.saved_search' },
    });
  }

  if (!hash) {
    const whole: Span = { start: 0, end: query.length };
    for (const recent of (await provider.recentSearches?.(prefix)) ?? []) {
      if (prefix && !recent.toLowerCase().includes(prefix.toLowerCase())) continue;
      out.push({
        kind: 'recent_search',
        label: recent,
        insert: recent,
        replace: whole,
        description: { key: 'query.group.recent' },
      });
    }
  }
  return out;
}

/**
 * Completions for the token under the caret. Pure: every value comes from the
 * provider, so the API and MCP surfaces wrap it with database-backed lookups.
 */
export async function suggest(
  query: string,
  caret: number,
  registry: Registry,
  provider: ValueProvider,
  options: SuggestOptions,
): Promise<Suggestion[]> {
  const context = contextAt(query, Math.max(0, Math.min(caret, query.length)), registry);
  switch (context.kind) {
    case 'clause':
      return clauseSuggestions(context, registry, provider, query);
    case 'value':
      return valueSuggestions(context, registry, provider, options);
    case 'sort_direction':
      return (['asc', 'desc'] as const)
        .filter(direction => direction.startsWith(context.prefix.toLowerCase()))
        .map(direction => ({
          kind: 'operator' as const,
          label: direction,
          insert: `${direction} `,
          replace: context.replace,
          description: { key: `query.suggest.${direction}` as const },
        }));
  }
}
