import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import { signUp } from './people.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'SRC';
const OTHER = 'SRO';

const create = (body: object) => w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Untitled', ...body });
const list = (who: IssueWorld['admin'], params: Record<string, string>) =>
  w.call(who, 'GET', `/v1/issues?${new URLSearchParams(params)}`);
const keysOf = (res: { json: () => { data: { key: string }[] } }) => res.json().data.map(i => i.key);

beforeAll(async () => {
  w = await issueWorld(KEY);
  await create({ title: 'Login redirect loops', priority: 'Critical' });
  await create({ title: 'Tag merge dialog', status: 'In Progress', assignees: [w.contributor.username] });
  await create({ title: 'Timesheet week start', status: 'Fixed', due_date: '2026-01-05' });
  await w.call(w.admin, 'POST', '/v1/projects', { name: 'Ops', key: OTHER });
  await w.call(w.admin, 'POST', '/v1/issues', { project: OTHER, title: 'Rotate the login keys' });
});

afterAll(async () => {
  await w.close();
});

describe('GET /v1/issues?q=', () => {
  test('searches every readable project, and only those', async () => {
    const all = await list(w.admin, { q: 'login', sort: 'key' });
    expect(all.statusCode).toBe(200);
    expect(keysOf(all)).toEqual([`${KEY}-1`, `${OTHER}-1`]);
    // The contributor is not a member of the second project.
    expect(keysOf(await list(w.contributor, { q: 'login' }))).toEqual([`${KEY}-1`]);
    expect(keysOf(await list(w.outsider, { q: 'login' }))).toEqual([]);
    expect(keysOf(await list(w.admin, { q: 'login', project: KEY }))).toEqual([`${KEY}-1`]);
  });

  test('attributes, me, categories and the sort override', async () => {
    expect(keysOf(await list(w.contributor, { q: 'assignee: me' }))).toEqual([`${KEY}-2`]);
    expect(keysOf(await list(w.admin, { q: `#Resolved project: ${KEY}` }))).toEqual([`${KEY}-3`]);
    expect(keysOf(await list(w.admin, { q: `#Unresolved project: ${KEY}`, sort: 'key desc' }))).toEqual([
      `${KEY}-2`,
      `${KEY}-1`,
    ]);
    expect(keysOf(await list(w.admin, { q: `project: ${KEY} sort by: key desc`, sort: 'key' }))).toEqual([
      `${KEY}-1`,
      `${KEY}-2`,
      `${KEY}-3`,
    ]);
  });

  test('a bad query is a 400 naming the fault, the span and the valid choices', async () => {
    const unknown = await list(w.admin, { q: 'colour: red' });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error).toMatchObject({
      code: 'query.unknown_attribute',
      field: 'q',
      span: { start: 0, end: 7 },
    });
    expect(unknown.json().error.valid_values).toContain('status');

    const value = await list(w.admin, { q: 'status: Donee' });
    expect(value.json().error).toMatchObject({ code: 'query.invalid_value', field: 'q' });
    expect(value.json().error.valid_values).toContain('In Progress');

    const who = await list(w.admin, { q: 'assignee: @nobody' });
    expect(who.json().error.code).toBe('query.invalid_value');
    expect((await list(w.admin, { q: '#Nonsense' })).json().error.code).toBe('query.invalid_value');
    const sort = await list(w.admin, { sort: 'title' });
    expect(sort.json().error).toMatchObject({ code: 'query.not_sortable', field: 'sort' });
    expect((await list(w.admin, { deleted: 'true' })).json().error.code).toBe('search.project_required');
  });

  test('group_by answers counts over the whole filtered set, and tags each row', async () => {
    const res = await list(w.admin, { q: `project: ${KEY}`, group_by: 'status', limit: '1' });
    const body = res.json();
    expect(body.meta.groups).toEqual([
      { value: 'Open', label: 'Open', count: 1, color: 'blue-2', category: 'unstarted' },
      { value: 'In Progress', label: 'In Progress', count: 1, color: 'yellow-2', category: 'started' },
      { value: 'Fixed', label: 'Fixed', count: 1, color: 'green-2', category: 'done' },
    ]);
    expect(body.meta.pagination).toMatchObject({ total: 3, limit: 1, has_more: true });
    expect(body.data[0].group).toBe('Open');

    const assignee = (await list(w.admin, { q: `project: ${KEY}`, group_by: 'assignee' })).json();
    expect(assignee.meta.groups.at(-1)).toMatchObject({ value: null, label: 'Unassigned', count: 2 });
    expect(assignee.meta.groups.every((g: object) => !('category' in g))).toBe(true);
  });

  test('group_limit caps the rows of each group, never the counts', async () => {
    const res = await list(w.admin, { q: `project: ${KEY}`, group_by: 'assignee', group_limit: '1', sort: 'key' });
    const body = res.json();
    expect(body.data.map((i: { group: string | null }) => i.group)).toEqual([w.contributor.username, null]);
    expect(keysOf(res)).toEqual([`${KEY}-2`, `${KEY}-1`]);
    expect(body.meta.groups.at(-1)).toMatchObject({ value: null, count: 2 });
    expect(body.meta.pagination).toMatchObject({ total: 3, has_more: false });

    const paged = (
      await list(w.admin, { q: `project: ${KEY}`, group_by: 'assignee', group_limit: '1', sort: 'key', limit: '1' })
    ).json();
    expect(paged.meta.pagination).toMatchObject({ total: 3, has_more: true });
  });

  test('a session search is remembered for autocomplete; a token search is not', async () => {
    await list(w.observer, { q: 'redirect' });
    const suggest = await w.call(w.observer, 'GET', '/v1/search/suggest?q=');
    expect(suggest.statusCode).toBe(200);
    const recent = suggest.json().data.filter((s: { kind: string }) => s.kind === 'recent_search');
    expect(recent.map((s: { label: string }) => s.label)).toEqual(['redirect']);

    const cleared = await w.call(w.observer, 'DELETE', '/v1/search/recent');
    expect(cleared.json().data).toEqual({ cleared: 1 });
  });
});

describe('GET /v1/search/suggest', () => {
  test('attributes carry their description; values come from the readable projects', async () => {
    const attrs = (await w.call(w.admin, 'GET', '/v1/search/suggest?q=crea')).json().data;
    expect(attrs).toContainEqual(
      expect.objectContaining({ kind: 'attribute', label: 'created by:', description: 'by reporter' }),
    );
    const values = (await w.call(w.admin, 'GET', `/v1/search/suggest?q=${encodeURIComponent('status: in')}`)).json()
      .data;
    expect(values).toContainEqual(expect.objectContaining({ label: '{In Progress}', insert: '{In Progress} ' }));
  });
});

describe('saved views', () => {
  const views = (who: IssueWorld['admin'], method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path = '', body?: object) =>
    w.call(who, method, `/v1/saved-views${path}`, body);

  test('private views for everyone; shared views from contributor up', async () => {
    const mine = await views(w.observer, 'POST', '', { name: 'My critical', query: '#Critical' });
    expect(mine.statusCode).toBe(201);
    expect(mine.json().data).toMatchObject({ name: 'My critical', visibility: 'private', can_edit: true });

    const denied = await views(w.observer, 'POST', '', {
      name: 'Shared by observer',
      query: '#Critical',
      visibility: 'project',
      project: KEY,
    });
    expect(denied.statusCode).toBe(403);

    const shared = await views(w.contributor, 'POST', '', {
      name: 'Open work',
      query: `project: ${KEY}   #Unresolved`,
      visibility: 'project',
      project: KEY,
      sort: 'key desc',
    });
    expect(shared.statusCode).toBe(201);
    expect(shared.json().data).toMatchObject({
      query: `project: ${KEY} #Unresolved`,
      project: { key: KEY },
      sort: [{ attribute: 'key', direction: 'desc' }],
    });
    expect((await views(w.contributor, 'POST', '', { name: 'open WORK', query: '' })).statusCode).toBe(409);
    const broken = await views(w.contributor, 'POST', '', { name: 'Broken', query: 'colour: red' });
    expect(broken.json().error).toMatchObject({ code: 'query.unknown_attribute', field: 'query' });
    const badValue = await views(w.contributor, 'POST', '', { name: 'Broken', query: 'status: Donee' });
    expect(badValue.json().error).toMatchObject({ code: 'query.invalid_value', field: 'query' });
    const missing = await views(w.contributor, 'POST', '', { name: 'No project', query: '', visibility: 'project' });
    expect(missing.json().error.code).toBe('saved_view.project_required');
  });

  test('#{Name} expands inside a query; a view that refers back to itself is refused', async () => {
    expect(keysOf(await list(w.observer, { q: '#{Open work}', sort: 'key' }))).toEqual([`${KEY}-1`, `${KEY}-2`]);
    expect(keysOf(await list(w.observer, { q: '#{Open work} assignee: Unassigned' }))).toEqual([`${KEY}-1`]);
    expect(keysOf(await list(w.observer, { q: '#{my critical}' }))).toEqual([`${KEY}-1`]);
    // Another user's private view is not visible, so the name is an unknown value.
    expect((await list(w.admin, { q: '#{My critical}' })).json().error.code).toBe('query.invalid_value');

    await views(w.admin, 'POST', '', { name: 'Loop A', query: 'type: Bug' });
    await views(w.admin, 'POST', '', { name: 'Loop B', query: '#{Loop A}' });
    const loop = await views(w.admin, 'PATCH', `/${encodeURIComponent('Loop A')}`, { query: '#{Loop B}' });
    expect(loop.json().error.code).toBe('query.saved_view_cycle');
  });

  test('editing a shared view: its owner, or an admin; not another contributor', async () => {
    const byAdmin = await views(w.admin, 'PATCH', `/${encodeURIComponent('Open work')}`, { columns: ['key', 'title'] });
    expect(byAdmin.statusCode).toBe(200);
    expect(byAdmin.json().data.columns).toEqual(['key', 'title']);

    const adminView = await views(w.admin, 'POST', '', {
      name: 'Admin board',
      query: '',
      visibility: 'org',
    });
    expect(adminView.statusCode).toBe(201);
    const seen = (await views(w.contributor, 'GET')).json().data;
    expect(seen.find((v: { name: string }) => v.name === 'Admin board').can_edit).toBe(false);
    expect((await views(w.contributor, 'PATCH', '/Admin%20board', { name: 'Mine now' })).statusCode).toBe(403);
    expect((await views(w.contributor, 'DELETE', '/Admin%20board')).statusCode).toBe(403);
    expect((await views(w.outsider, 'GET', '/Admin%20board')).statusCode).toBe(404);

    const removed = await views(w.contributor, 'DELETE', `/${encodeURIComponent('Open work')}`);
    expect(removed.json().data.name).toBe('Open work');
    expect((await views(w.contributor, 'GET', `/${encodeURIComponent('Open work')}`)).statusCode).toBe(404);
  });
});

describe('POST /v1/issues/bulk-update', () => {
  test('applies per issue and reports each result', async () => {
    const res = await w.call(w.admin, 'POST', '/v1/issues/bulk-update', {
      issues: [`${KEY}-1`, `${KEY}-2`, `${KEY}-99`],
      changes: { priority: 'Major', add_assignees: [w.admin.username] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([
      { key: `${KEY}-1`, result: 'updated' },
      { key: `${KEY}-2`, result: 'updated' },
      { key: `${KEY}-99`, result: 'failed', error: expect.objectContaining({ code: 'issue.not_found' }) },
    ]);
    const two = (await w.call(w.admin, 'GET', `/v1/issues/${KEY}-2`)).json().data;
    expect(two.assignees.map((a: { username: string }) => a.username).sort()).toEqual(
      [w.admin.username, w.contributor.username].sort(),
    );

    const again = await w.call(w.admin, 'POST', '/v1/issues/bulk-update', {
      issues: [`${KEY}-1`],
      changes: { priority: 'Major' },
    });
    expect(again.json().data[0].result).toBe('unchanged');

    const observer = await w.call(w.observer, 'POST', '/v1/issues/bulk-update', {
      issues: [`${KEY}-1`],
      changes: { priority: 'Minor' },
    });
    expect(observer.json().data[0]).toMatchObject({ result: 'failed', error: { code: 'forbidden' } });

    const bad = await w.call(w.admin, 'POST', '/v1/issues/bulk-update', {
      issues: [`${KEY}-1`],
      changes: { status: 'Nope' },
    });
    expect(bad.json().data[0].error).toMatchObject({ code: 'issue.unknown_status', field: 'status' });
  });

  test('refuses more than 500 issues, duplicates and an empty change', async () => {
    const many = Array.from({ length: 501 }, (_, i) => `${KEY}-${i + 1}`);
    expect(
      (await w.call(w.admin, 'POST', '/v1/issues/bulk-update', { issues: many, changes: { priority: 'Major' } }))
        .statusCode,
    ).toBe(400);
    const dupes = await w.call(w.admin, 'POST', '/v1/issues/bulk-update', {
      issues: [`${KEY}-1`, `${KEY.toLowerCase()}-1`],
      changes: { priority: 'Major' },
    });
    expect(dupes.json().error.code).toBe('issue.bulk_duplicate');
    expect(
      (await w.call(w.admin, 'POST', '/v1/issues/bulk-update', { issues: [`${KEY}-1`], changes: {} })).statusCode,
    ).toBe(400);
  });
});

describe('GET /v1/issues/export.csv', () => {
  test('streams the same query as the list', async () => {
    const res = await w.call(
      w.admin,
      'GET',
      `/v1/issues/export.csv?q=${encodeURIComponent(`project: ${KEY}`)}&sort=key`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('-issues-');
    const lines = res.body.trim().split('\r\n');
    expect(lines[0]!.startsWith('key,title,project,status')).toBe(true);
    expect(lines.slice(1).map(l => l.split(',')[0])).toEqual([`${KEY}-1`, `${KEY}-2`, `${KEY}-3`]);

    const narrow = await w.call(
      w.admin,
      'GET',
      `/v1/issues/export.csv?q=${encodeURIComponent('#Resolved')}&columns=key,status`,
    );
    expect(narrow.body).toBe(`key,status\r\n${KEY}-3,Fixed\r\n`);

    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, { name: 'CSV Sprint' });
    await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-1`, { sprint: 'CSV Sprint', story_points: 3 });
    const sprint = await w.call(
      w.admin,
      'GET',
      `/v1/issues/export.csv?q=${encodeURIComponent(`project: ${KEY}`)}&sort=key&columns=key,story_points,sprint`,
    );
    expect(sprint.body.split('\r\n').slice(0, 3)).toEqual([
      'key,story_points,sprint',
      `${KEY}-1,3,CSV Sprint`,
      `${KEY}-2,,`,
    ]);

    const bad = await w.call(w.admin, 'GET', '/v1/issues/export.csv?q=colour:red');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('query.unknown_attribute');
  });
});

describe('GET /v1/issues/figures', () => {
  test('counts over the scoped query, overall and per project', async () => {
    const all = (await w.call(w.admin, 'GET', '/v1/issues/figures')).json().data;
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ project: null, open: 3, created_7d: 4, resolved_7d: 1 });
    expect(all[0].by_category).toMatchObject({ unstarted: 2, started: 1, done: 1 });

    const per = (await w.call(w.admin, 'GET', '/v1/issues/figures?per=project')).json().data;
    expect(per.map((p: { project: { key: string } }) => p.project.key).sort()).toEqual([KEY, OTHER].sort());

    const mine = (
      await w.call(w.contributor, 'GET', `/v1/issues/figures?q=${encodeURIComponent('assignee: me')}`)
    ).json().data[0];
    expect(mine.open).toBe(1);
    expect((await w.call(w.contributor, 'GET', `/v1/issues/figures?project=${OTHER}`)).statusCode).toBe(404);
  });
});

describe('landing and the last project', () => {
  test('an account that never belonged anywhere is sent to the welcome flow; a removed one is told so', async () => {
    const empty = { organization_slug: null, project_key: null };
    const person = await signUp(w.app, w.box, 'Newcomer');
    expect((await w.call(person, 'GET', '/v1/me/landing')).json().data).toEqual({ kind: 'welcome', ...empty });

    const link = (await w.call(w.admin, 'POST', `/v1/organizations/${w.slug}/invitations/links`, {})).json().data;
    await w.call(person, 'POST', '/v1/invitations/accept', { token: /\/invite\/(.+)$/.exec(link.url)![1] });
    const username = (await w.call(person, 'GET', `/v1/organizations/${w.slug}`)).json().data.membership.username;
    expect((await w.call(w.admin, 'DELETE', `/v1/organizations/${w.slug}/members/${username}`)).statusCode).toBe(200);
    expect((await w.call(person, 'GET', '/v1/me/landing')).json().data).toEqual({ kind: 'no_org', ...empty });
  });

  test('last project wins; clearing it falls back by project count', async () => {
    const set = await w.call(w.contributor, 'PATCH', '/v1/me/preferences', { last_project_key: KEY });
    expect(set.json().data.preferences.last_project_key).toBe(KEY);
    expect((await w.call(w.contributor, 'GET', '/v1/me/landing')).json().data).toEqual({
      kind: 'project',
      organization_slug: w.slug,
      project_key: KEY,
    });
    expect((await w.call(w.contributor, 'PATCH', '/v1/me/preferences', { last_project_key: OTHER })).statusCode).toBe(
      404,
    );

    await w.call(w.admin, 'PATCH', '/v1/me/preferences', { last_project_key: null });
    expect((await w.call(w.admin, 'GET', '/v1/me/landing')).json().data).toMatchObject({ kind: 'project_list' });
    expect((await w.call(w.observer, 'GET', '/v1/me/landing')).json().data).toEqual({
      kind: 'project',
      organization_slug: w.slug,
      project_key: KEY,
    });
  });
});
