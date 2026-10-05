import { describe, expect, test } from 'bun:test';
import { issueRegistry, parse, QueryError, render, RESERVED_ISSUE_ATTRIBUTES } from '../src/index.ts';

const registry = issueRegistry({
  customFields: [
    { slug: 'severity', name: 'Severity', type: 'enum' },
    { slug: 'budget', name: 'Budget', type: 'number' },
    { slug: 'blocking', name: 'Blocking', type: 'boolean' },
    { slug: 'owner', name: 'Owner', type: 'user', empty: 'Nobody' },
    { slug: 'status', name: 'Shadow', type: 'text' },
  ],
});

const clauses = (input: string) => parse(input, registry).query.clauses;

describe('custom field attributes', () => {
  test('a checkbox takes Yes or No, in any spelling', () => {
    expect(clauses('blocking: yes, False')).toEqual([
      {
        kind: 'attribute',
        attribute: 'blocking',
        values: [
          { kind: 'literal', value: 'yes', negated: false },
          { kind: 'literal', value: 'no', negated: false },
        ],
      },
    ]);
    expect(() => parse('blocking: maybe', registry)).toThrow(QueryError);
    expect(registry.attribute('blocking')?.empty).toBeUndefined();
  });

  test('a negative number is written braced; unbraced `-` stays negation', () => {
    expect(clauses('budget: {-5}')[0]).toMatchObject({ values: [{ kind: 'number', value: -5, negated: false }] });
    expect(clauses('budget: -5')[0]).toMatchObject({ values: [{ kind: 'number', value: 5, negated: true }] });
    expect(clauses('budget: {-10} .. 20')[0]).toMatchObject({
      values: [{ kind: 'range', from: { kind: 'number', value: -10 }, to: { kind: 'number', value: 20 } }],
    });
    expect(render(parse('budget: {-5}', registry).query, registry)).toBe('budget: {-5}');
  });

  test("the field's empty label is its empty value", () => {
    expect(clauses('owner: Nobody')[0]).toMatchObject({ values: [{ kind: 'empty' }] });
    expect(clauses('severity: {No Severity}')[0]).toMatchObject({ values: [{ kind: 'empty' }] });
  });

  test('custom attributes are marked, sortable by type, and never shadow a built-in', () => {
    expect(registry.attribute('severity')).toMatchObject({ custom: true, sortable: true, shorthand: true });
    expect(registry.attribute('status')?.custom).toBeUndefined();
    expect(RESERVED_ISSUE_ATTRIBUTES.has('due date')).toBe(true);
    expect(RESERVED_ISSUE_ATTRIBUTES.has('aggregate')).toBe(true);
    expect(RESERVED_ISSUE_ATTRIBUTES.has('subtask of')).toBe(true);
    expect(RESERVED_ISSUE_ATTRIBUTES.has('severity')).toBe(false);
  });
});
