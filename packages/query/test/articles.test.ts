import { describe, expect, test } from 'bun:test';
import { articleRegistry, parse, QueryError, render } from '../src/index.ts';

const registry = articleRegistry();
const q = (input: string) => parse(input, registry).query;

describe('article registry: knowledge-base.md § Knowledge base search', () => {
  test('tag: rca', () => {
    expect(q('tag: rca').clauses).toEqual([
      { kind: 'attribute', attribute: 'tag', values: [{ kind: 'literal', value: 'rca', negated: false }] },
    ]);
  });

  test('tag: rca, incident', () => {
    expect(q('tag: rca, incident').clauses[0]).toMatchObject({ values: [{ value: 'rca' }, { value: 'incident' }] });
  });

  test('tag: -draft-notes', () => {
    expect(q('tag: -draft-notes').clauses[0]).toMatchObject({ values: [{ value: 'draft-notes', negated: true }] });
  });

  test('created by: @alex', () => {
    expect(q('created by: @alex').clauses[0]).toMatchObject({
      attribute: 'created by',
      values: [{ value: '@alex' }],
    });
  });

  test('updated: {minus 30d} .. Today', () => {
    expect(q('updated: {minus 30d} .. Today').clauses[0]).toMatchObject({
      values: [
        { kind: 'range', from: { kind: 'relative', amount: 30, unit: 'd' }, to: { kind: 'keyword', keyword: 'today' } },
      ],
    });
  });

  test('status: draft', () => {
    expect(q('status: draft').clauses[0]).toMatchObject({ attribute: 'status', values: [{ value: 'draft' }] });
  });

  test('parent: {Runbooks}', () => {
    expect(q('parent: {Runbooks}').clauses[0]).toMatchObject({ attribute: 'parent', values: [{ value: 'Runbooks' }] });
  });

  test('free text across title and body', () => {
    expect(q('payment outage rca').clauses).toEqual([
      { kind: 'text', text: 'payment', phrase: false },
      { kind: 'text', text: 'outage', phrase: false },
      { kind: 'text', text: 'rca', phrase: false },
    ]);
  });

  test('issue attributes are unknown here', () => {
    for (const input of [
      'priority: Major',
      'assignee: me',
      'sprint: {August 2026}',
      'aggregate Subtask of: {tag: x}',
    ]) {
      expect(() => q(input)).toThrow(QueryError);
    }
  });

  test('has: and sort by: over the reduced set', () => {
    expect(q('has: tag sort by: updated desc').clauses).toEqual([
      { kind: 'attribute', attribute: 'has', values: [{ kind: 'attribute', attribute: 'tag', negated: false }] },
      { kind: 'sort', keys: [{ attribute: 'updated', direction: 'desc' }] },
    ]);
    expect(() => q('sort by: priority')).toThrow(QueryError);
  });

  test('renders back to the same text', () => {
    expect(render(q('tag: rca, -incident status: draft parent: {Runbooks} outage'), registry)).toBe(
      'tag: rca, -incident status: draft parent: Runbooks outage',
    );
  });
});
