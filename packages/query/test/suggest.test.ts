import { describe, expect, test } from 'bun:test';
import { type AttributeDefinition, issueRegistry, suggest, type Suggestion, type ValueProvider } from '../src/index.ts';

const registry = issueRegistry({ customFields: [{ slug: 'code', name: 'Code', type: 'text' }] });

const DATA: Record<string, string[]> = {
  priority: ['Show-stopper', 'Critical', 'Major', 'Normal'],
  status: ['Open', 'In Progress', 'Code Review', 'Done'],
  type: ['Bug', 'Task', 'Feature'],
  tag: ['ui', 'area:billing', 'area:checkout', 'need-design'],
  sprint: ['April 2026', 'August 2026'],
  assignee: ['@avery', '@alex'],
};

const matches = (candidate: string, prefix: string) =>
  candidate.toLowerCase().startsWith(prefix.toLowerCase()) ||
  candidate
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some(part => part.startsWith(prefix.toLowerCase()));

const provider: ValueProvider = {
  values: (attribute: AttributeDefinition, prefix: string) =>
    (DATA[attribute.name] ?? []).filter(v => matches(v, prefix)).map(value => ({ value })),
  savedSearches: prefix => ['Commented by me', 'My open bugs'].filter(v => matches(v, prefix)),
  recentSearches: () => ['type: Bug status: Open', 'status: -Resolved', '#Unresolved type: Bug, Task'],
};

const context = { today: '2026-09-24', weekStartsOn: 1 as const };
const run = (query: string, caret = query.length) => suggest(query, caret, registry, provider, context);
const labels = (items: Suggestion[]) => items.map(item => item.label);
const ofKind = (items: Suggestion[], kind: Suggestion['kind']) => items.filter(item => item.kind === kind);

describe('suggest: clause position', () => {
  test('typing `a` lists attributes, links and aggregates whose words start with a, then # values, then recents', async () => {
    const items = await run('a');
    expect(labels(ofKind(items, 'attribute'))).toEqual([
      'assignee:',
      'attachments:',
      'work author:',
      'aggregate relates to:',
      'aggregate is required for:',
      'aggregate depends on:',
      'aggregate is duplicated by:',
      'aggregate duplicates:',
      'aggregate parent for:',
      'aggregate subtask of:',
    ]);
    expect(labels(ofKind(items, 'value'))).toEqual([
      '#{April 2026}',
      '#{August 2026}',
      '#{area:billing}',
      '#{area:checkout}',
    ]);
    expect(labels(ofKind(items, 'recent_search'))).toEqual([
      'type: Bug status: Open',
      'status: -Resolved',
      '#Unresolved type: Bug, Task',
    ]);
    expect(items[0]).toMatchObject({
      insert: 'assignee: ',
      replace: { start: 0, end: 1 },
      description: { key: 'query.attribute.assignee' },
    });
  });

  test('typing `c` matches inside multi-word values and offers saved searches', async () => {
    const items = await run('c');
    expect(labels(ofKind(items, 'attribute'))).toEqual([
      'created by:',
      'commenter:',
      'commented:',
      'comments:',
      'created:',
      'code:',
    ]);
    expect(labels(ofKind(items, 'value'))).toEqual(['#Critical', '#{Code Review}', '#{area:checkout}']);
    expect(labels(ofKind(items, 'saved_search'))).toEqual(['#{Commented by me}']);
    const codeReview = items.find(item => item.label === '#{Code Review}');
    expect(codeReview).toMatchObject({ insert: '#{Code Review} ', description: { key: 'query.group.status' } });
    expect(items.find(item => item.label === 'code:')?.description).toEqual({
      key: 'query.attribute.custom_field',
      params: { name: 'Code' },
    });
  });

  test('typing `st` matches Status, Story points, #Star and #Show-stopper, and filters recents by substring', async () => {
    const items = await run('st');
    expect(labels(items)).toEqual([
      'status:',
      'start date:',
      'story points:',
      '#Star',
      '#Show-stopper',
      'type: Bug status: Open',
      'status: -Resolved',
    ]);
  });

  test('after a `#` only values, categories and saved searches remain', async () => {
    const items = await run('#c');
    expect(labels(items)).toEqual(['#Critical', '#{Code Review}', '#{area:checkout}', '#{Commented by me}']);
    expect(items[0]?.replace).toEqual({ start: 0, end: 2 });
  });

  test('an empty query lists everything', async () => {
    const items = await run('');
    expect(ofKind(items, 'attribute').length).toBeGreaterThan(20);
    expect(labels(ofKind(items, 'recent_search'))).toHaveLength(3);
  });

  test('a new clause after a complete one starts fresh', async () => {
    const items = await run('status: Open ty');
    expect(labels(items)).toEqual(['type:', 'work type:', 'type: Bug status: Open', '#Unresolved type: Bug, Task']);
    expect(items[0]?.replace).toEqual({ start: 13, end: 15 });
  });

  test('a recent search replaces the whole query', async () => {
    const items = await run('status: Open ty');
    expect(ofKind(items, 'recent_search')[0]).toMatchObject({
      insert: 'type: Bug status: Open',
      replace: { start: 0, end: 15 },
    });
  });
});

describe('suggest: value position', () => {
  test('right after `due date:` offers exclude, the empty value, the open range and dates', async () => {
    const items = await run('due date: ');
    expect(labels(items).slice(0, 8)).toEqual([
      '-',
      '{No due date}',
      '..',
      '2026-09',
      'Today',
      'Tomorrow',
      'Yesterday',
      '{This week}',
    ]);
    expect(items[0]).toMatchObject({ kind: 'operator', insert: '-', description: { key: 'query.suggest.exclude' } });
    expect(items[1]).toMatchObject({ description: { key: 'query.suggest.empty', params: { attribute: 'due date' } } });
    expect(items.find(item => item.label === 'Today')).toMatchObject({
      insert: 'Today ',
      replace: { start: 10, end: 10 },
      description: { key: 'query.suggest.day', params: { date: '2026-09-24' } },
    });
    expect(items.find(item => item.label === '{This week}')?.description).toEqual({
      key: 'query.suggest.period',
      params: { from: '2026-09-21', to: '2026-09-27' },
    });
    expect(items.find(item => item.label === 'Monday')?.description).toEqual({
      key: 'query.suggest.day',
      params: { date: '2026-09-21' },
    });
  });

  test('enum values come from the provider, grouped and filtered by prefix', async () => {
    const items = await run('status: ');
    expect(labels(items)).toEqual(['-', 'Open', '{In Progress}', '{Code Review}', 'Done']);
    expect(items[2]).toMatchObject({
      insert: '{In Progress} ',
      description: { key: 'query.group.status' },
      replace: { start: 8, end: 8 },
    });

    const typed = await run('status: co');
    expect(labels(typed)).toEqual(['{Code Review}']);
    expect(typed[0]?.replace).toEqual({ start: 8, end: 10 });
  });

  test('a negated prefix keeps the minus', async () => {
    const items = await run('status: -o');
    expect(items).toEqual([
      {
        kind: 'value',
        label: '-Open',
        insert: '-Open ',
        replace: { start: 8, end: 10 },
        description: { key: 'query.group.status' },
      },
    ]);
  });

  test('a half-typed braced value completes the brace', async () => {
    const items = await run('status: {In');
    expect(items.map(item => item.insert)).toEqual(['{In Progress} ']);
    expect(items[0]?.replace).toEqual({ start: 8, end: 11 });
  });

  test('a second value after a comma stays in the same attribute', async () => {
    const items = await run('status: Open, ');
    expect(labels(items)).toEqual(['-', 'Open', '{In Progress}', '{Code Review}', 'Done']);
  });

  test('user attributes offer me first, then the empty value and people', async () => {
    const items = await run('assignee: ');
    expect(labels(items)).toEqual(['-', 'Unassigned', 'me', '@avery', '@alex']);
  });

  test('has: offers attribute names, braced when multi-word', async () => {
    const items = await run('has: -d');
    expect(labels(items)).toEqual(['-description', '-{resolved date}', '-{due date}', '-{start date}']);
    expect(items[2]).toMatchObject({ insert: '-{due date} ', description: { key: 'query.attribute.due_date' } });
    expect(items[0]?.description).toBeUndefined();
  });

  test('sort by: offers sortable attributes, then a direction', async () => {
    expect(labels(await run('sort by: '))).toEqual([
      '-',
      'priority',
      'status',
      'type',
      'created',
      'updated',
      '{resolved date}',
      '{due date}',
      '{start date}',
      '{spent time}',
      'estimation',
      '{story points}',
      'votes',
      'key',
    ]);
    expect(labels(await run('sort by: updated '))).toEqual(['asc', 'desc']);
    expect(labels(await run('sort by: updated d'))).toEqual(['desc']);
    expect(labels(await run('sort by: updated desc, '))).toContain('priority');
  });

  test('link attributes take issue keys, so nothing is offered but exclude', async () => {
    expect(labels(await run('subtask of: '))).toEqual(['-']);
  });

  test('the caret in the middle of a value completes from the text before it', async () => {
    const items = await run('status: Open type: Bug', 10);
    expect(labels(items)).toEqual(['Open']);
    expect(items[0]?.replace).toEqual({ start: 8, end: 12 });
  });
});
