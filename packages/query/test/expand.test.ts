import { describe, expect, test } from 'bun:test';
import {
  checkValues,
  expandSavedViews,
  issueRegistry,
  parse,
  QueryError,
  render,
  shorthandNames,
  sortKeysOf,
  vocabularyNeeds,
  type Query,
  type Vocabulary,
} from '../src/index.ts';

const registry = issueRegistry();
const q = (text: string): Query => parse(text, registry).query;

const views: Record<string, Query> = {
  'my open bugs': q('type: Bug #Unresolved sort by: updated desc'),
  outer: q('#{My open bugs} assignee: me'),
  loop: q('#{Loop}'),
};
const lookup = (name: string) => views[name.toLowerCase()];

describe('expandSavedViews', () => {
  test('replaces a view name with its query, nested views included, and leaves enum shorthands', () => {
    const expanded = expandSavedViews(q('#{Outer} #Critical'), lookup);
    expect(expanded.clauses[0]).toMatchObject({ kind: 'view', name: 'Outer' });
    expect(expanded.clauses[1]).toEqual({ kind: 'shorthand', value: 'Critical' });
    const outer = expanded.clauses[0] as { query: Query };
    expect(outer.query.clauses[0]).toMatchObject({ kind: 'view', name: 'My open bugs' });
    expect(render(expanded, registry)).toBe('#Outer #Critical');
  });

  test('a view that reaches itself is a cycle, including through `self`', () => {
    expect(() => expandSavedViews(q('#Loop'), lookup)).toThrow(QueryError);
    expect(() => expandSavedViews(q('#{My open bugs}'), lookup, 'my open bugs')).toThrow(QueryError);
  });

  test('shorthandNames and sortKeysOf see through views', () => {
    expect(shorthandNames(q('#{Outer} aggregate Subtask of: {#Critical}')).sort()).toEqual(['Critical', 'Outer']);
    expect(sortKeysOf(expandSavedViews(q('#{Outer}'), lookup))).toEqual([{ attribute: 'updated', direction: 'desc' }]);
    expect(sortKeysOf(expandSavedViews(q('#{Outer} sort by: key'), lookup))).toEqual([
      { attribute: 'key', direction: 'asc' },
    ]);
  });
});

describe('checkValues', () => {
  const entry = (...names: string[]) => ({ accepted: new Set(names.map(n => n.toLowerCase())), display: names });
  const vocabulary: Vocabulary = {
    status: entry('Open', 'In Progress'),
    priority: entry('Critical'),
    type: entry('Bug'),
    tag: entry('ui'),
    sprint: entry(),
    user: entry('alex.lee'),
  };
  const check = (text: string) => {
    const parsed = parse(text, registry);
    checkValues(parsed.query, registry, vocabulary, parsed.spans);
  };

  test('known values pass, case-insensitively, with or without @', () => {
    expect(() => check('status: open, {in progress} assignee: @Alex.Lee, me #critical #UI')).not.toThrow();
    expect(() => check('#Resolved status: -Resolved sprint: {No sprint}')).not.toThrow();
  });

  test('an unknown value names the clause and lists the valid choices', () => {
    try {
      check('type: Bug status: Donee');
      throw new Error('expected a QueryError');
    } catch (err) {
      expect(err).toBeInstanceOf(QueryError);
      const e = err as QueryError;
      expect(e.code).toBe('query.invalid_value');
      expect(e.span).toEqual({ start: 10, end: 23 });
      expect(e.validValues).toEqual(['Open', 'In Progress']);
    }
    expect(() => check('#Nonsense')).toThrow(QueryError);
    expect(() => check('sprint: {Sprint 14}')).toThrow(QueryError);
    expect(() => check('aggregate Subtask of: {assignee: nobody}')).toThrow(QueryError);
  });

  test('vocabularyNeeds asks only for what the query names', () => {
    expect([...vocabularyNeeds(q('status: Open created by: me'), registry)]).toEqual(['status']);
    expect([...vocabularyNeeds(q('assignee: alex'), registry)]).toEqual(['user']);
    expect(vocabularyNeeds(q('login #Resolved'), registry).size).toBe(0);
  });
});
