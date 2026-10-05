import { describe, expect, test } from 'bun:test';
import type { Clause, Query, Value } from '../src/index.ts';
import { issueRegistry, parse, QueryError, render } from '../src/index.ts';

const registry = issueRegistry({
  customFields: [
    { slug: 'code', name: 'Code', type: 'text' },
    { slug: 'severity', name: 'Severity', type: 'enum' },
  ],
});

const q = (input: string): Query => parse(input, registry).query;

const lit = (value: string, negated = false): Value => ({ kind: 'literal', value, negated });
const attr = (attribute: string, ...values: Value[]): Clause => ({ kind: 'attribute', attribute, values });
const text = (t: string, phrase = false): Clause => ({ kind: 'text', text: t, phrase });
const kw = (keyword: string, negated = false): Value => ({ kind: 'keyword', keyword, negated }) as unknown as Value;
const date = (d: string): Value => ({ kind: 'date', date: d, negated: false });
const rel = (sign: -1 | 1, amount: number, unit: string): Value =>
  ({ kind: 'relative', sign, amount, unit, negated: false }) as unknown as Value;
const range = (from: Value | null, to: Value | null, negated = false): Value =>
  ({ kind: 'range', from: from && strip(from), to: to && strip(to), negated }) as Value;
const strip = ({ negated: _n, ...rest }: Value) => rest;

const examples: Array<[input: string, expected: Clause[]]> = [
  // Basic form
  [
    'type: Bug status: Open assignee: me',
    [attr('type', lit('Bug')), attr('status', lit('Open')), attr('assignee', { kind: 'me', negated: false })],
  ],
  ['status: Rejected, Duplicate', [attr('status', lit('Rejected'), lit('Duplicate'))]],
  ['type: Bug, Feature', [attr('type', lit('Bug'), lit('Feature'))]],
  // Values with spaces
  ['status: {In Progress}', [attr('status', lit('In Progress'))]],
  [
    'status: Open, {In Progress}, {Ready for QA}',
    [attr('status', lit('Open'), lit('In Progress'), lit('Ready for QA'))],
  ],
  ['tag: {area:billing}, {Partner Portal}', [attr('tag', lit('area:billing'), lit('Partner Portal'))]],
  ['tag: {area:billing} {Partner Portal}', [attr('tag', lit('area:billing')), text('Partner Portal', true)]],
  // Negation
  ['status: -Open', [attr('status', lit('Open', true))]],
  ['status: -Resolved', [attr('status', { kind: 'category', category: 'resolved', negated: true })]],
  ['tag: -ui', [attr('tag', lit('ui', true))]],
  ['assignee: -me', [attr('assignee', { kind: 'me', negated: true })]],
  ['type: -Epic, -Task', [attr('type', lit('Epic', true), lit('Task', true))]],
  ['status: -Open, -Reopened', [attr('status', lit('Open', true), lit('Reopened', true))]],
  ['status: -{In Progress}', [attr('status', lit('In Progress', true))]],
  // Bare-value shorthand
  ['#Critical', [{ kind: 'shorthand', value: 'Critical' }]],
  ['#{Code Review}', [{ kind: 'shorthand', value: 'Code Review' }]],
  ['#{area:checkout}', [{ kind: 'shorthand', value: 'area:checkout' }]],
  ['#{August 2026}', [{ kind: 'shorthand', value: 'August 2026' }]],
  ['#Unresolved', [{ kind: 'category', category: 'unresolved' }]],
  ['#Resolved', [{ kind: 'category', category: 'resolved' }]],
  ['#Star', [{ kind: 'category', category: 'starred' }]],
  // Saved searches inline
  ['#{Commented by me}', [{ kind: 'shorthand', value: 'Commented by me' }]],
  [
    '#{My open bugs} priority: Critical',
    [{ kind: 'shorthand', value: 'My open bugs' }, attr('priority', lit('Critical'))],
  ],
  // me
  ['created by: me', [attr('created by', { kind: 'me', negated: false })]],
  ['commenter: me', [attr('commenter', { kind: 'me', negated: false })]],
  ['work author: me', [attr('work author', { kind: 'me', negated: false })]],
  // Dates
  ['created: 2026-09-19', [attr('created', date('2026-09-19'))]],
  ['created: 2026-01-01 .. 2026-09-19', [attr('created', range(date('2026-01-01'), date('2026-09-19')))]],
  ['created: 2026-01-01..2026-09-19', [attr('created', range(date('2026-01-01'), date('2026-09-19')))]],
  ['created: Today', [attr('created', kw('today'))]],
  ['created: Yesterday', [attr('created', kw('yesterday'))]],
  ['created: {This week}', [attr('created', kw('this week'))]],
  ['created: {Last week}', [attr('created', kw('last week'))]],
  ['created: {minus 7d} .. Today', [attr('created', range(rel(-1, 7, 'd'), kw('today')))]],
  ['due date: Today .. {plus 14d}', [attr('due date', range(kw('today'), rel(1, 14, 'd')))]],
  ['resolved date: {Last month}', [attr('resolved date', kw('last month'))]],
  ['updated: {minus 24h} .. Now', [attr('updated', range(rel(-1, 24, 'h'), kw('now')))]],
  ['created: 2026-09', [attr('created', { kind: 'month', month: '2026-09', negated: false })]],
  ['due date: Monday', [attr('due date', { kind: 'weekday', weekday: 1, negated: false })]],
  ['created: Tomorrow, {Next week}, {This year}', [attr('created', kw('tomorrow'), kw('next week'), kw('this year'))]],
  ['created: {minus 7d} .. *', [attr('created', range(rel(-1, 7, 'd'), null))]],
  ['created: * .. Today', [attr('created', range(null, kw('today')))]],
  ['due date: {No due date}', [attr('due date', { kind: 'empty', negated: false })]],
  ['assignee: Unassigned', [attr('assignee', { kind: 'empty', negated: false })]],
  // Existence
  ['has: attachments', [attr('has', { kind: 'attribute', attribute: 'attachments', negated: false })]],
  ['has: -description', [attr('has', { kind: 'attribute', attribute: 'description', negated: true })]],
  ['has: -assignee', [attr('has', { kind: 'attribute', attribute: 'assignee', negated: true })]],
  ['has: comments', [attr('has', { kind: 'attribute', attribute: 'comments', negated: false })]],
  ['has: -estimation', [attr('has', { kind: 'attribute', attribute: 'estimation', negated: true })]],
  ['has: -{due date}', [attr('has', { kind: 'attribute', attribute: 'due date', negated: true })]],
  // Numeric and duration comparison
  ['story points: 5', [attr('story points', { kind: 'number', value: 5, negated: false })]],
  [
    'story points: 3 .. 8',
    [
      attr(
        'story points',
        range({ kind: 'number', value: 3, negated: false }, { kind: 'number', value: 8, negated: false }),
      ),
    ],
  ],
  ['spent time: {1d} ..', [attr('spent time', range({ kind: 'duration', raw: '1d', negated: false }, null))]],
  ['estimation: .. {4h}', [attr('estimation', range(null, { kind: 'duration', raw: '4h', negated: false }))]],
  ['votes: 1 ..', [attr('votes', range({ kind: 'number', value: 1, negated: false }, null))]],
  ['estimation: {1w 1d 1h 1m}', [attr('estimation', { kind: 'duration', raw: '1w 1d 1h 1m', negated: false })]],
  ['story points: -5', [attr('story points', { kind: 'number', value: 5, negated: true })]],
  // Link traversal
  [
    'aggregate Subtask of: {status: Open}',
    [{ kind: 'aggregate', link: 'subtask of', query: { clauses: [attr('status', lit('Open'))] } }],
  ],
  [
    'aggregate Parent for: {status: -Resolved}',
    [
      {
        kind: 'aggregate',
        link: 'parent for',
        query: { clauses: [attr('status', { kind: 'category', category: 'resolved', negated: true })] },
      },
    ],
  ],
  [
    'aggregate Duplicates: {project: PMS}',
    [{ kind: 'aggregate', link: 'duplicates', query: { clauses: [attr('project', lit('PMS'))] } }],
  ],
  [
    'aggregate Is duplicated by: {#Critical}',
    [{ kind: 'aggregate', link: 'is duplicated by', query: { clauses: [{ kind: 'shorthand', value: 'Critical' }] } }],
  ],
  [
    'aggregate Subtask of: {status: {In Progress}}',
    [{ kind: 'aggregate', link: 'subtask of', query: { clauses: [attr('status', lit('In Progress'))] } }],
  ],
  // Link by key
  [
    'subtask of: PMS-88',
    [{ kind: 'link', link: 'subtask of', values: [{ kind: 'key', key: 'PMS-88', negated: false }] }],
  ],
  [
    'relates to: PMS-1, pms-2',
    [
      {
        kind: 'link',
        link: 'relates to',
        values: [
          { kind: 'key', key: 'PMS-1', negated: false },
          { kind: 'key', key: 'PMS-2', negated: false },
        ],
      },
    ],
  ],
  [
    'depends on: -PMS-3',
    [{ kind: 'link', link: 'depends on', values: [{ kind: 'key', key: 'PMS-3', negated: true }] }],
  ],
  [
    'key: PMS-1, PMS-2',
    [attr('key', { kind: 'key', key: 'PMS-1', negated: false }, { kind: 'key', key: 'PMS-2', negated: false })],
  ],
  // Sorting
  ['sort by: updated desc', [{ kind: 'sort', keys: [{ attribute: 'updated', direction: 'desc' }] }]],
  [
    'sort by: priority asc, updated desc',
    [
      {
        kind: 'sort',
        keys: [
          { attribute: 'priority', direction: 'asc' },
          { attribute: 'updated', direction: 'desc' },
        ],
      },
    ],
  ],
  ['sort by: priority', [{ kind: 'sort', keys: [{ attribute: 'priority', direction: 'asc' }] }]],
  [
    'sort by: {due date} desc, key',
    [
      {
        kind: 'sort',
        keys: [
          { attribute: 'due date', direction: 'desc' },
          { attribute: 'key', direction: 'asc' },
        ],
      },
    ],
  ],
  // Free text
  ['login redirect loop', [text('login'), text('redirect'), text('loop')]],
  ['login redirect status: Open', [text('login'), text('redirect'), attr('status', lit('Open'))]],
  ['"login redirect loop"', [text('login redirect loop', true)]],
  ['{login}', [text('login', true)]],
  ['type: Task {figma}', [attr('type', lit('Task')), text('figma', true)]],
  // Attribute names are case-insensitive and tolerate spaces; values keep their case for compile to match insensitively
  ['Status: Open', [attr('status', lit('Open'))]],
  ['Type: bug', [attr('type', lit('bug'))]],
  ['TYPE: BUG', [attr('type', lit('BUG'))]],
  ['#ui', [{ kind: 'shorthand', value: 'ui' }]],
  ['#UI', [{ kind: 'shorthand', value: 'UI' }]],
  ['created: TODAY, {this WEEK}', [attr('created', kw('today'), kw('this week'))]],
  ['Created By: me', [attr('created by', { kind: 'me', negated: false })]],
  ['status:Open,{In Progress}', [attr('status', lit('Open'), lit('In Progress'))]],
  // Other attributes
  ['project: PMS', [attr('project', lit('PMS'))]],
  ['comments: {redirect loop}', [attr('comments', lit('redirect loop'))]],
  ['attachments: screenshot.png', [attr('attachments', lit('screenshot.png'))]],
  ['work type: Testing', [attr('work type', lit('Testing'))]],
  ['updated by: @alex', [attr('updated by', lit('@alex'))]],
  ['commented: Today', [attr('commented', kw('today'))]],
  ['sprint: {August 2026}', [attr('sprint', lit('August 2026'))]],
  // Custom fields by slug
  ['code: ABC-1', [attr('code', lit('ABC-1'))]],
  ['severity: High, -Low', [attr('severity', lit('High'), lit('Low', true))]],
  // Recent-search shapes from the reference UI
  [
    '#Unresolved type: Bug, Task Status: Open,{In Progress}',
    [
      { kind: 'category', category: 'unresolved' },
      attr('type', lit('Bug'), lit('Task')),
      attr('status', lit('Open'), lit('In Progress')),
    ],
  ],
  ['', []],
];

describe('parse: every example in search-query-language.md', () => {
  test.each(examples)('%s', (input, expected) => {
    expect(q(input).clauses).toEqual(expected);
  });
});

describe('parse: round trip through render', () => {
  test.each(examples.filter(([input]) => input !== ''))('%s', input => {
    const first = q(input);
    const rendered = render(first, registry);
    expect(q(rendered)).toEqual(first);
  });

  test('renders canonical text', () => {
    expect(render(q('Status: -{In Progress}, Open  sort by: {due date} desc, key'), registry)).toBe(
      'status: -{In Progress}, Open sort by: {due date} desc, key',
    );
    expect(render(q('created: {minus 7d} .. Today has: -{due date}'), registry)).toBe(
      'created: {minus 7d} .. Today has: -{due date}',
    );
    expect(render(q('assignee: unassigned due date: {no due date}'), registry)).toBe(
      'assignee: Unassigned due date: {No due date}',
    );
    expect(render(q('estimation: .. {4h} spent time: {1d 2h} ..'), registry)).toBe(
      'estimation: .. 4h spent time: {1d 2h} ..',
    );
    expect(render(q('#unresolved #star #{Code Review}'), registry)).toBe('#Unresolved #Star #{Code Review}');
  });
});

const failures: Array<[input: string, code: string, params: Record<string, string | number> | undefined]> = [
  ['foo: bar', 'query.unknown_attribute', { attribute: 'foo' }],
  ['http://example.com', 'query.unknown_attribute', { attribute: 'http' }],
  ['status:', 'query.missing_value', undefined],
  ['status: type: Bug', 'query.missing_value', undefined],
  ['status: Open,', 'query.missing_value', undefined],
  ['status: {Open', 'query.unbalanced_braces', undefined],
  ['status: Open}', 'query.unbalanced_braces', undefined],
  ['"unterminated', 'query.unterminated_quote', undefined],
  ['created: someday', 'query.invalid_value', { attribute: 'created', value: 'someday' }],
  ['story points: many', 'query.invalid_value', undefined],
  ['estimation: 4 hours', 'query.invalid_value', undefined],
  ['key: notakey', 'query.invalid_value', undefined],
  ['subtask of: Open', 'query.invalid_value', undefined],
  ['has: -due date', 'query.unknown_attribute', { attribute: 'due' }],
  ['has: sort by', 'query.unknown_attribute', undefined],
  ['sort by: comments', 'query.not_sortable', { attribute: 'comments' }],
  ['sort by: Due Date desc', 'query.not_sortable', { attribute: 'Due' }],
  ['aggregate Blocks: {status: Open}', 'query.unknown_link', { link: 'blocks' }],
  ['aggregate Subtask of: status', 'query.expected_subquery', undefined],
  ['aggregate Subtask of: {foo: bar}', 'query.unknown_attribute', undefined],
  ['status: ..', 'query.invalid_range', undefined],
  ['status: Open .. Closed', 'query.invalid_range', undefined],
  ['votes: *', 'query.invalid_range', undefined],
  ['#', 'query.missing_value', undefined],
  ['# status: Open', 'query.missing_value', undefined],
  ['assignee: -', 'query.invalid_value', undefined],
];

describe('parse: errors carry a catalogue code and the offending span', () => {
  test.each(failures)('%s → %s', (input, code, params) => {
    let caught: unknown;
    try {
      q(input);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(QueryError);
    const error = caught as QueryError;
    expect(error.code).toBe(code as QueryError['code']);
    if (params) expect(error.params).toEqual(params);
    expect(error.span.start).toBeGreaterThanOrEqual(0);
    expect(error.span.end).toBeLessThanOrEqual(input.length);
  });

  test('an unknown attribute lists the valid ones', () => {
    expect(() => q('foo: bar')).toThrow(QueryError);
    try {
      q('foo: bar');
    } catch (error) {
      expect((error as QueryError).validValues).toContain('created by');
      expect((error as QueryError).span).toEqual({ start: 0, end: 4 });
    }
  });

  test('a non-sortable attribute lists the sortable ones', () => {
    try {
      q('sort by: tag');
    } catch (error) {
      expect((error as QueryError).validValues).toEqual([
        'priority',
        'status',
        'type',
        'created',
        'updated',
        'resolved date',
        'due date',
        'start date',
        'spent time',
        'estimation',
        'story points',
        'votes',
        'key',
        'severity',
      ]);
    }
  });
});

describe('parse: clause spans', () => {
  test('reports where each clause and its values start', () => {
    const { spans } = parse('login status: Open, {In Progress} #Critical', registry);
    expect(spans).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 33, valueStart: 13 },
      { start: 34, end: 43 },
    ]);
  });
});
