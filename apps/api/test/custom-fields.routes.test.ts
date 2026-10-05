import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { PatScope } from '@nothingleft/types';
import { databaseFoldsDottedCapitalI } from './held-transaction.ts';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import type { Person } from './people.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'CF';
const fields = `/v1/projects/${KEY}/custom-fields`;

const create = (body: object) => w.call(w.admin, 'POST', fields, body);
const newIssue = async (body: object = {}) => {
  const res = await w.call(w.contributor, 'POST', '/v1/issues', { project: KEY, title: 'An issue', ...body });
  return res;
};
const patch = (key: string, body: object, who = w.contributor) => w.call(who, 'PATCH', `/v1/issues/${key}`, body);
const valueOf = (issue: { custom_fields: { slug: string; value: unknown }[] }, slug: string) =>
  issue.custom_fields.find(f => f.slug === slug)?.value;
const search = async (q: string, extra = '') =>
  (await w.call(w.contributor, 'GET', `/v1/issues?project=${KEY}&q=${encodeURIComponent(q)}${extra}`)).json();

async function token(who: Person, scopes: PatScope[]): Promise<Person> {
  const res = await w.call(who, 'POST', '/v1/me/tokens', { name: `t-${scopes.join('-')}`, scopes });
  return { email: who.email, sid: '', headers: { authorization: `Bearer ${res.json().data.token}` } };
}

beforeAll(async () => {
  w = await issueWorld(KEY);
});

afterAll(async () => {
  await w.close();
});

describe('defining fields', () => {
  test('a select with options, scoped to Bug, slugged from its name', async () => {
    const res = await create({
      name: 'Severity',
      type: 'select',
      applies_to: ['Bug'],
      options: [{ name: 'Low' }, { name: 'High', color: 'red-3' }, { name: 'Critical', color: 'red-5' }],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      slug: 'severity',
      name: 'Severity',
      type: 'select',
      applies_to: ['Bug'],
      is_required: false,
      empty_label: null,
      time_role: null,
      options: [
        { name: 'Low', color: 'gray-2', position: 0, is_archived: false },
        { name: 'High', color: 'red-3', position: 1 },
        { name: 'Critical', color: 'red-5', position: 2 },
      ],
    });
  });

  test('every other type', async () => {
    const specs = [
      { name: 'Summary line', type: 'text' },
      { name: 'Notes', type: 'markdown' },
      { name: 'Budget', type: 'number', config: { min: -100, max: 1000, decimals: 2 } },
      { name: 'Seats', type: 'integer', config: { min: 0 } },
      { name: 'Launch', type: 'date' },
      { name: 'Deploy at', type: 'datetime' },
      { name: 'Blocking', type: 'checkbox' },
      { name: 'Platforms', type: 'multi_select', options: [{ name: 'Web' }, { name: 'iOS' }, { name: 'Android' }] },
      { name: 'Reviewer', type: 'user' },
      { name: 'Watchers list', slug: 'observers', type: 'multi_user' },
      { name: 'Spec', type: 'url' },
      { name: 'Review time', type: 'duration' },
    ];
    for (const spec of specs) {
      const res = await create(spec);
      expect(res.statusCode).toBe(201);
    }
    const list = (await w.call(w.observer, 'GET', fields)).json().data as { slug: string }[];
    expect(list.map(f => f.slug)).toEqual([
      'severity',
      'summary-line',
      'notes',
      'budget',
      'seats',
      'launch',
      'deploy-at',
      'blocking',
      'platforms',
      'reviewer',
      'observers',
      'spec',
      'review-time',
    ]);
  });

  test('slugs: fixed, unique, never a built-in attribute', async () => {
    expect((await create({ name: 'severity', type: 'text' })).json().error.code).toBe('custom_field.name_taken');
    expect((await create({ name: 'Sev', slug: 'severity', type: 'select' })).json().error.code).toBe(
      'custom_field.slug_taken',
    );
    expect((await create({ name: 'Status', type: 'text' })).json().error.code).toBe('custom_field.slug_reserved');
    expect((await create({ name: 'Due', slug: 'Due_Date', type: 'date' })).json().error.code).toBe(
      'custom_field.slug_invalid',
    );
    const rename = await w.call(w.admin, 'PATCH', `${fields}/severity`, { name: 'Impact' });
    expect(rename.json().data).toMatchObject({ slug: 'severity', name: 'Impact' });
    await w.call(w.admin, 'PATCH', `${fields}/impact`, { name: 'Severity' });
  });

  test('config is checked against the type', async () => {
    const bad = await create({ name: 'Odd', type: 'text', config: { min: 1 } });
    expect(bad.json().error.code).toBe('custom_field.config_invalid');
    const range = await create({ name: 'Odd', type: 'number', config: { min: 5, max: 1 } });
    expect(range.json().error.code).toBe('custom_field.config_invalid');
    const options = await create({ name: 'Odd', type: 'text', options: [{ name: 'x' }] });
    expect(options.json().error.code).toBe('custom_field.options_not_supported');
    const required = await create({ name: 'Odd', type: 'checkbox', is_required: true });
    expect(required.json().error.code).toBe('custom_field.checkbox_not_required');
  });

  test('only a Project Admin and above manage fields; a token needs admin:project', async () => {
    const byContributor = await w.call(w.contributor, 'POST', fields, { name: 'Nope', type: 'text' });
    expect(byContributor.statusCode).toBe(403);
    const byProjectAdmin = await w.call(w.projectAdmin, 'POST', fields, { name: 'Area', type: 'text' });
    expect(byProjectAdmin.statusCode).toBe(201);
    const byOutsider = await w.call(w.outsider, 'GET', fields);
    expect(byOutsider.statusCode).toBe(404);
    await w.call(w.admin, 'DELETE', `${fields}/area`);

    const pat = await token(w.admin, ['issues:read', 'issues:write']);
    const scoped = await w.call(pat, 'POST', fields, { name: 'Area', type: 'text' });
    expect(scoped.statusCode).toBe(403);
    expect(scoped.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'admin:project' });
    const reader = await token(w.admin, ['issues:read']);
    const { key } = (await newIssue()).json().data;
    const set = await w.call(reader, 'PATCH', `/v1/issues/${key}`, { custom_fields: { budget: 1 } });
    expect(set.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'issues:write' });
  });
});

describe('values on issues', () => {
  test('create and PATCH take custom_fields by slug or name; the Issue lists what applies', async () => {
    const created = await newIssue({
      type: 'Bug',
      custom_fields: {
        severity: 'high',
        Budget: 12.5,
        seats: '3',
        launch: '2026-10-01',
        'deploy-at': '2026-10-01T09:30:00Z',
        blocking: true,
        platforms: ['Web', 'ios'],
        reviewer: `@${w.admin.username}`,
        observers: [w.contributor.username, w.admin.username],
        spec: 'https://example.com/spec',
        'review time': '1h 30m',
        'summary line': 'One line',
        notes: '**bold**',
      },
    });
    expect(created.statusCode).toBe(201);
    const issue = created.json().data;
    expect(valueOf(issue, 'severity')).toEqual({ name: 'High', color: 'red-3' });
    expect(valueOf(issue, 'budget')).toBe(12.5);
    expect(valueOf(issue, 'seats')).toBe(3);
    expect(valueOf(issue, 'launch')).toBe('2026-10-01');
    expect(valueOf(issue, 'deploy-at')).toBe('2026-10-01T09:30:00.000Z');
    expect(valueOf(issue, 'blocking')).toBe(true);
    expect(valueOf(issue, 'platforms')).toEqual([
      { name: 'Web', color: 'gray-2' },
      { name: 'iOS', color: 'gray-2' },
    ]);
    expect((valueOf(issue, 'reviewer') as { username: string }).username).toBe(w.admin.username);
    expect((valueOf(issue, 'observers') as { username: string }[]).map(p => p.username).sort()).toEqual(
      [w.admin.username, w.contributor.username].sort(),
    );
    expect(valueOf(issue, 'review-time')).toBe(90);
    const severity = issue.custom_fields.find((f: { slug: string }) => f.slug === 'severity');
    expect(severity).toMatchObject({ name: 'Severity', type: 'select', empty_label: 'No Severity' });

    const cleared = await patch(issue.key, { custom_fields: { severity: null, platforms: [], blocking: false } });
    const after = cleared.json().data;
    expect(valueOf(after, 'severity')).toBeNull();
    expect(valueOf(after, 'platforms')).toEqual([]);
    expect(valueOf(after, 'blocking')).toBe(false);
  });

  test('bad values name the fault and the choices', async () => {
    const { key } = (await newIssue({ type: 'Bug' })).json().data;
    const option = await patch(key, { custom_fields: { severity: 'Huge' } });
    expect(option.json().error).toMatchObject({
      code: 'custom_field.unknown_option',
      field: 'custom_fields.severity',
      valid_values: ['Low', 'High', 'Critical'],
    });
    const unknown = await patch(key, { custom_fields: { nope: 1 } });
    expect(unknown.json().error.code).toBe('custom_field.unknown');
    expect(unknown.json().error.valid_values).toContain('severity');
    expect((await patch(key, { custom_fields: { budget: 5000 } })).json().error.code).toBe('custom_field.out_of_range');
    expect((await patch(key, { custom_fields: { budget: 1.234 } })).json().error.code).toBe(
      'custom_field.invalid_value',
    );
    expect((await patch(key, { custom_fields: { seats: 1.5 } })).json().error.code).toBe('custom_field.invalid_value');
    expect((await patch(key, { custom_fields: { launch: '2026-02-30' } })).json().error.code).toBe(
      'custom_field.invalid_value',
    );
    expect((await patch(key, { custom_fields: { spec: 'ftp://x' } })).json().error.code).toBe(
      'custom_field.invalid_value',
    );
    expect((await patch(key, { custom_fields: { severity: ['Low', 'High'] } })).json().error.code).toBe(
      'custom_field.invalid_value',
    );
    const stranger = await patch(key, { custom_fields: { reviewer: '@nobody' } });
    expect(stranger.json().error.code).toBe('custom_field.unknown_user');
  });

  test('a field scoped to Bug does not apply to a Feature; its value is kept, hidden, and returns', async () => {
    const feature = await newIssue({ type: 'Feature', custom_fields: { severity: 'Low' } });
    expect(feature.json().error.code).toBe('custom_field.not_applicable');

    const bug = (await newIssue({ type: 'Bug', custom_fields: { severity: 'Critical' } })).json().data;
    const moved = (await patch(bug.key, { type: 'Feature' })).json().data;
    expect(moved.custom_fields.map((f: { slug: string }) => f.slug)).not.toContain('severity');
    expect((await search(`key: ${bug.key} severity: Critical`)).data).toHaveLength(0);
    const hidden = (await w.call(w.admin, 'GET', `${fields}/severity`)).json().data.issue_count as number;
    const visible = (await search('has: severity')).data.length as number;
    expect(hidden).toBe(visible + 1);
    const back = (await patch(bug.key, { type: 'Bug' })).json().data;
    expect(valueOf(back, 'severity')).toEqual({ name: 'Critical', color: 'red-5' });
  });

  test('bulk update sets custom fields, with per-issue refusals', async () => {
    const bug = (await newIssue({ type: 'Bug' })).json().data.key;
    const task = (await newIssue({ type: 'Task' })).json().data.key;
    const res = await w.call(w.contributor, 'POST', '/v1/issues/bulk-update', {
      issues: [bug, task],
      changes: { custom_fields: { severity: 'High', budget: 7 } },
    });
    const results = res.json().data as { key: string; result: string; error?: { code: string } }[];
    expect(results.map(r => [r.key, r.result, r.error?.code])).toEqual([
      [bug, 'updated', undefined],
      [task, 'failed', 'custom_field.not_applicable'],
    ]);
  });

  test('observers cannot set values', async () => {
    const { key } = (await newIssue()).json().data;
    const res = await patch(key, { custom_fields: { budget: 1 } }, w.observer);
    expect(res.statusCode).toBe(403);
  });

  test('history records custom:<slug> with readable snapshots, and coalesces', async () => {
    const { key } = (await newIssue({ type: 'Bug' })).json().data;
    await patch(key, { custom_fields: { severity: 'Low', platforms: ['Android', 'Web'] } });
    await patch(key, { custom_fields: { severity: 'High', notes: 'changed' } });
    const history = (await w.call(w.contributor, 'GET', `/v1/issues/${key}/activity?kind=field_changed`)).json()
      .data as { field: string; old_value: unknown; new_value: unknown }[];
    const byField = Object.fromEntries(history.map(h => [h.field, h]));
    expect(byField['custom:severity']).toMatchObject({ old_value: null, new_value: { name: 'High' } });
    expect(byField['custom:platforms']).toMatchObject({ old_value: null, new_value: ['Android', 'Web'] });
    expect(byField['custom:notes']).toMatchObject({ old_value: null, new_value: null });
    await patch(key, { custom_fields: { reviewer: w.admin.username, observers: [w.contributor.username] } });
    const named = (await w.call(w.contributor, 'GET', `/v1/issues/${key}/activity?kind=field_changed`)).json().data as {
      field: string;
      people: { username: string }[];
    }[];
    expect(named.find(h => h.field === 'custom:reviewer')?.people.map(p => p.username)).toEqual([w.admin.username]);
    expect(named.find(h => h.field === 'custom:observers')?.people.map(p => p.username)).toEqual([
      w.contributor.username,
    ]);
    expect(history.filter(h => h.field === 'custom:severity')).toHaveLength(1);
  });
});

describe('required fields and defaults', () => {
  test('a default fills a new issue; required refuses one left empty', async () => {
    await create({
      name: 'Tier',
      type: 'select',
      options: [{ name: 'Gold' }, { name: 'Silver' }],
      is_required: true,
      default_value: 'Silver',
    });
    const issue = (await newIssue()).json().data;
    expect(valueOf(issue, 'tier')).toEqual({ name: 'Silver', color: 'gray-2' });
    const cleared = await patch(issue.key, { custom_fields: { tier: null } });
    expect(cleared.json().error).toMatchObject({ code: 'custom_field.required', field: 'custom_fields.tier' });

    await w.call(w.admin, 'PATCH', `${fields}/tier`, { default_value: null });
    const refused = await newIssue();
    expect(refused.json().error.code).toBe('custom_field.required');
    expect((await newIssue({ custom_fields: { tier: 'Gold' } })).statusCode).toBe(201);

    const badDefault = await w.call(w.admin, 'PATCH', `${fields}/tier`, { default_value: 'Bronze' });
    expect(badDefault.json().error).toMatchObject({ code: 'custom_field.unknown_option', field: 'default_value' });
    await w.call(w.admin, 'PATCH', `${fields}/tier`, { is_required: false });
  });

  test('a type change that makes a required field apply takes its default, or is refused', async () => {
    await create({ name: 'Root cause', type: 'text', applies_to: ['Bug'], is_required: true });
    const task = (await newIssue({ type: 'Task' })).json().data;
    const refused = await patch(task.key, { type: 'Bug' });
    expect(refused.json().error.code).toBe('custom_field.required');
    const ok = await patch(task.key, { type: 'Bug', custom_fields: { 'root-cause': 'A race' } });
    expect(valueOf(ok.json().data, 'root-cause')).toBe('A race');
    await w.call(w.admin, 'DELETE', `${fields}/root-cause`);
  });
});

describe('search', () => {
  let keys: [string, string, string];

  beforeAll(async () => {
    const make = async (custom: object) =>
      (await newIssue({ type: 'Bug', custom_fields: custom })).json().data.key as string;
    keys = [
      await make({ severity: 'Low', budget: -5, launch: '2026-11-01', blocking: true, reviewer: w.admin.username }),
      await make({ severity: 'Critical', budget: 50, launch: '2026-11-15', platforms: ['iOS'] }),
      await make({ severity: 'High', budget: 500, 'review-time': '2h', 'summary-line': 'needle in text' }),
    ];
  });

  const found = async (q: string) => ((await search(q)).data as { key: string }[]).map(i => i.key);

  test('typed comparison by slug', async () => {
    expect(await found(`severity: Critical key: ${keys.join(', ')}`)).toEqual([keys[1]]);
    expect(await found(`severity: -Low key: ${keys.join(', ')}`)).toEqual([keys[2], keys[1]]);
    expect(await found('budget: 40 .. 600')).toEqual([keys[2], keys[1]]);
    expect(await found('budget: {-5}')).toEqual([keys[0]]);
    expect(await found('launch: 2026-11-10 .. 2026-11-30')).toEqual([keys[1]]);
    expect(await found(`blocking: Yes key: ${keys.join(', ')}`)).toEqual([keys[0]]);
    expect(await found(`blocking: No key: ${keys.join(', ')}`)).toEqual([keys[2], keys[1]]);
    expect(await found('platforms: iOS')).toContain(keys[1]);
    expect(await found(`reviewer: ${w.admin.username} key: ${keys.join(', ')}`)).toEqual([keys[0]]);
    expect(await found('review-time: 1h ..')).toContain(keys[2]);
    expect(await found('summary-line: needle')).toEqual([keys[2]]);
    expect(await found(`#Critical key: ${keys.join(', ')}`)).toEqual([keys[1]]);
    expect(await found(`has: -platforms key: ${keys.join(', ')}`)).toEqual([keys[2], keys[0]]);
    expect(await found(`severity: {No Severity} key: ${keys.join(', ')}`)).toEqual([]);
  });

  test('sort by a custom field', async () => {
    const q = `key: ${keys.join(', ')} sort by: budget desc`;
    expect(await found(q)).toEqual([keys[2], keys[1], keys[0]]);
    const bySeverity = await found(`key: ${keys.join(', ')} sort by: severity`);
    expect(bySeverity).toEqual([keys[0], keys[2], keys[1]]);
  });

  test('a bad value answers query.invalid_value with the options', async () => {
    const res = await search('severity: Huge');
    expect(res.error).toMatchObject({ code: 'query.invalid_value', valid_values: ['Critical', 'High', 'Low'] });
    const unknown = await search('nope: 1');
    expect(unknown.error.code).toBe('query.unknown_attribute');
    expect(unknown.error.valid_values).toContain('severity');
    const bool = await search('blocking: maybe');
    expect(bool.error.code).toBe('query.invalid_value');
  });

  test('group by a custom field, with filter-aware counts', async () => {
    const res = await search(`key: ${keys.join(', ')}`, '&group_by=custom:severity');
    expect(res.meta.groups.map((g: { label: string; count: number }) => [g.label, g.count])).toEqual([
      ['Low', 1],
      ['High', 1],
      ['Critical', 1],
    ]);
    const bad = await search('', '&group_by=custom:budget');
    expect(bad.error.code).toBe('search.not_groupable');
  });

  test('autocomplete offers the slug and its options', async () => {
    const attrs = (await w.call(w.contributor, 'GET', `/v1/search/suggest?q=sever&caret=5`)).json().data;
    expect(attrs.map((s: { label: string }) => s.label)).toContain('severity:');
    const values = (await w.call(w.contributor, 'GET', `/v1/search/suggest?q=severity:%20cr&caret=12`)).json().data;
    expect(values.map((s: { label: string }) => s.label)).toContain('Critical');
  });

  test('CSV export takes custom:<slug> columns', async () => {
    const res = await w.call(
      w.contributor,
      'GET',
      `/v1/issues/export.csv?project=${KEY}&q=${encodeURIComponent(`key: ${keys[1]}`)}&columns=key,custom:severity,custom:platforms,custom:budget`,
    );
    expect(res.statusCode).toBe(200);
    expect(
      res.body
        .replace(/^\uFEFF/, '')
        .trim()
        .split(/\r?\n/),
    ).toEqual(['key,custom:severity,custom:platforms,custom:budget', `${keys[1]},Critical,iOS,50`]);
  });
});

describe('options', () => {
  test('rename by id updates every issue; delete in use needs move_to and records history', async () => {
    const issue = (await newIssue({ type: 'Bug', custom_fields: { severity: 'Low' } })).json().data;
    const renamed = await w.call(w.admin, 'PATCH', `${fields}/severity/options/Low`, {
      name: 'Minor',
      color: 'green-2',
    });
    expect(renamed.json().data.options[0]).toMatchObject({ name: 'Minor', color: 'green-2' });
    const fresh = (await w.call(w.contributor, 'GET', `/v1/issues/${issue.key}`)).json().data;
    expect(valueOf(fresh, 'severity')).toEqual({ name: 'Minor', color: 'green-2' });

    const inUse = await w.call(w.admin, 'DELETE', `${fields}/severity/options/Minor`);
    expect(inUse.json().error).toMatchObject({
      code: 'custom_field.option_in_use',
      valid_values: ['High', 'Critical'],
    });
    const moved = await w.call(w.admin, 'DELETE', `${fields}/severity/options/Minor?move_to=High`);
    expect(moved.statusCode).toBe(200);
    expect(moved.json().data.options.map((o: { name: string }) => o.name)).toEqual(['High', 'Critical']);
    const after = (await w.call(w.contributor, 'GET', `/v1/issues/${issue.key}`)).json().data;
    expect(valueOf(after, 'severity')).toEqual({ name: 'High', color: 'red-3' });
    const history = (await w.call(w.contributor, 'GET', `/v1/issues/${issue.key}/activity?kind=field_changed`)).json()
      .data as { field: string; old_value: unknown; new_value: unknown }[];
    expect(history.at(-1)).toMatchObject({
      field: 'custom:severity',
      old_value: { name: 'Minor' },
      new_value: { name: 'High' },
    });

    const added = await w.call(w.admin, 'POST', `${fields}/severity/options`, { name: 'Low', position: 0 });
    expect(added.json().data.options.map((o: { name: string }) => o.name)).toEqual(['Low', 'High', 'Critical']);
  });

  test('an archived option stays on its issues but cannot be newly chosen', async () => {
    const issue = (await newIssue({ custom_fields: { platforms: ['Android'] } })).json().data;
    await w.call(w.admin, 'PATCH', `${fields}/platforms/options/Android`, { is_archived: true });
    const other = (await newIssue()).json().data;
    expect((await patch(other.key, { custom_fields: { platforms: ['Android'] } })).json().error.code).toBe(
      'custom_field.unknown_option',
    );
    const kept = await patch(issue.key, { custom_fields: { platforms: ['Android', 'Web'] } });
    expect(kept.statusCode).toBe(200);
  });
});

describe('archive, delete and the cap', () => {
  test('archive keeps values but hides and freezes the field', async () => {
    await create({ name: 'Legacy id', type: 'text' });
    const issue = (await newIssue({ custom_fields: { 'legacy-id': 'L-1' } })).json().data;
    await w.call(w.admin, 'PATCH', `${fields}/legacy-id`, { is_archived: true });
    const read = (await w.call(w.contributor, 'GET', `/v1/issues/${issue.key}`)).json().data;
    expect(read.custom_fields.map((f: { slug: string }) => f.slug)).not.toContain('legacy-id');
    expect((await patch(issue.key, { custom_fields: { 'legacy-id': 'L-2' } })).json().error.code).toBe(
      'custom_field.archived',
    );
    expect((await search('legacy-id: L-1')).data.map((i: { key: string }) => i.key)).toEqual([issue.key]);
    const archived = (await w.call(w.admin, 'GET', `${fields}?archived=true`)).json().data;
    expect(archived.map((f: { slug: string }) => f.slug)).toEqual(['legacy-id']);
  });

  test('delete destroys the values', async () => {
    const res = await w.call(w.admin, 'DELETE', `${fields}/legacy-id`);
    expect(res.json().data.slug).toBe('legacy-id');
    expect((await search('legacy-id: L-1')).error.code).toBe('query.unknown_attribute');
  });

  test('at most 50 live fields', async () => {
    const live = (await w.call(w.admin, 'GET', `${fields}?archived=false`)).json().data.length as number;
    for (let i = live; i < 50; i += 1) {
      expect((await create({ name: `Filler ${i}`, type: 'text' })).statusCode).toBe(201);
    }
    expect((await create({ name: 'One too many', type: 'text' })).json().error.code).toBe('custom_field.limit');
    for (let i = live; i < 50; i += 1) await w.call(w.admin, 'DELETE', `${fields}/filler-${i}`);
  });
});

describe('one slug, one kind, across the organisation', () => {
  test('another project may reuse a slug of the same kind, and a search spans both', async () => {
    await w.call(w.admin, 'POST', '/v1/projects', { name: 'Second', key: 'CF2' });
    const other = `/v1/projects/CF2/custom-fields`;
    const clash = await w.call(w.admin, 'POST', other, { name: 'Severity', type: 'number' });
    expect(clash.json().error).toMatchObject({ code: 'custom_field.slug_conflict' });
    const same = await w.call(w.admin, 'POST', other, {
      name: 'Severity',
      type: 'multi_select',
      options: [{ name: 'Critical' }],
    });
    expect(same.statusCode).toBe(201);
    const there = (
      await w.call(w.admin, 'POST', '/v1/issues', {
        project: 'CF2',
        title: 'Elsewhere',
        custom_fields: { severity: ['Critical'] },
      })
    ).json().data;
    const res = (await w.call(w.admin, 'GET', `/v1/issues?q=${encodeURIComponent('severity: Critical')}`)).json();
    expect(res.data.map((i: { key: string }) => i.key)).toContain(there.key);
    expect(res.data.some((i: { key: string }) => i.key.startsWith(`${KEY}-`))).toBe(true);
  });

  test('two projects claiming one new slug with different kinds at once: one wins, one hears the kind conflict', async () => {
    await w.call(w.admin, 'POST', '/v1/projects', { name: 'Third', key: 'CF3' });
    const [a, b] = await Promise.all([
      w.call(w.admin, 'POST', fields, { name: 'Race', slug: 'race-kind', type: 'text' }),
      w.call(w.admin, 'POST', '/v1/projects/CF3/custom-fields', { name: 'Race', slug: 'race-kind', type: 'duration' }),
    ]);
    const outcomes = [a, b].map(r => (r.statusCode === 201 ? 'created' : r.json().error.code)).sort();
    expect(outcomes).toEqual(['created', 'custom_field.slug_conflict']);
  });
});

describe('Estimation and Spent time fields', () => {
  test('a duration field as Estimation becomes the estimate; one as Spent time mirrors the rollup', async () => {
    await create({ name: 'Original estimate', type: 'duration' });
    await create({ name: 'Logged', type: 'duration' });
    const notDuration = await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}`, { estimation_field: 'budget' });
    expect(notDuration.json().error.code).toBe('custom_field.time_field_invalid');
    const same = await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}`, {
      estimation_field: 'original-estimate',
      spent_time_field: 'original-estimate',
    });
    expect(same.json().error.code).toBe('custom_field.time_fields_same');
    const project = await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}`, {
      estimation_field: 'Original estimate',
      spent_time_field: 'logged',
    });
    expect(project.json().data).toMatchObject({
      estimation_field: { slug: 'original-estimate', name: 'Original estimate' },
      spent_time_field: { slug: 'logged', name: 'Logged' },
    });

    const issue = (await newIssue({ estimate: '2h' })).json().data;
    expect(issue.estimate_minutes).toBe(120);
    expect(valueOf(issue, 'original-estimate')).toBe(120);
    const updated = (await patch(issue.key, { estimate: '3h' })).json().data;
    expect(valueOf(updated, 'original-estimate')).toBe(180);
    const history = (await w.call(w.contributor, 'GET', `/v1/issues/${issue.key}/activity?kind=field_changed`)).json()
      .data as { field: string }[];
    expect(history.map(h => h.field)).toContain('custom:original-estimate');
    expect((await search(`key: ${issue.key} estimation: 3h`)).data).toHaveLength(1);

    expect((await patch(issue.key, { custom_fields: { logged: '1h' } })).json().error.code).toBe(
      'custom_field.read_only',
    );
    await w.call(w.contributor, 'POST', `/v1/issues/${issue.key}/work-items`, {
      records: [{ work_date: '2026-09-21', duration: '45m' }],
    });
    const withTime = (await w.call(w.contributor, 'GET', `/v1/issues/${issue.key}`)).json().data;
    expect(valueOf(withTime, 'logged')).toBe(45);
    expect((await search(`key: ${issue.key} logged: 30m .. 1h`)).data).toHaveLength(1);

    const archive = await w.call(w.admin, 'PATCH', `${fields}/logged`, { is_archived: true });
    expect(archive.json().error.code).toBe('custom_field.time_role');
    await w.call(w.admin, 'DELETE', `${fields}/logged`);
    const back = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}`)).json().data;
    expect(back.spent_time_field).toBeNull();
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}`, { estimation_field: null });
  });
});

describe('names under concurrency', () => {
  test('two fields of one name with different slugs: one is created, the other hears custom_field.name_taken', async () => {
    const results = await Promise.all([
      create({ name: 'Root cause', slug: 'root-cause-a', type: 'text' }),
      create({ name: 'root cause', slug: 'root-cause-b', type: 'text' }),
    ]);
    expect(results.filter(r => r.statusCode === 201)).toHaveLength(1);
    const refused = results.find(r => r.statusCode !== 201)!;
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('custom_field.name_taken');
  });

  test('concurrent options of one name: one is added, the others hear custom_field.option_name_taken', async () => {
    await create({ name: 'Blast radius', type: 'select', options: [{ name: 'Small' }] });
    const results = await Promise.all(
      ['Wide', 'wide', 'WIDE'].map(name => w.call(w.admin, 'POST', `${fields}/blast-radius/options`, { name })),
    );
    expect(results.filter(r => r.statusCode === 201)).toHaveLength(1);
    for (const r of results.filter(r => r.statusCode !== 201)) {
      expect(r.json().error.code).toBe('custom_field.option_name_taken');
    }
  });

  test('options sent with a new field that the database folds together answer custom_field.option_name_taken', async () => {
    const res = await create({ name: 'Cities', type: 'select', options: [{ name: 'istanbul' }, { name: 'İstanbul' }] });
    if (await databaseFoldsDottedCapitalI(w)) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatchObject({ code: 'custom_field.option_name_taken', field: 'options' });
    } else {
      expect(res.statusCode).toBe(201);
    }
  });
});
