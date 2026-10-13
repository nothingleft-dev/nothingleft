import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { PatScope } from '@nothingleft/types';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import type { Person } from './people.ts';

setDefaultTimeout(180_000);

let w: IssueWorld;
const KEY = 'RP';
const OTHER = 'RQ';

const create = async (body: object, who: Person = w.admin) => {
  const res = await w.call(who, 'POST', '/v1/issues', { project: KEY, ...body });
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
  return res.json().data.key as string;
};
const log = async (key: string, work_date: string, duration: string, work_type?: string, who: Person = w.admin) => {
  const res = await w.call(who, 'POST', `/v1/issues/${key}/work-items`, {
    records: [{ work_date, duration }],
    ...(work_type ? { work_type } : {}),
  });
  if (res.statusCode !== 201) throw new Error(`log failed: ${res.body}`);
};
async function token(who: Person, scopes: PatScope[], project_keys?: string[]): Promise<Person> {
  const res = await w.call(who, 'POST', '/v1/me/tokens', {
    name: `t-${scopes.join('-')}-${project_keys?.join('-') ?? 'all'}`,
    scopes,
    ...(project_keys ? { project_keys } : {}),
  });
  if (res.statusCode !== 201) throw new Error(`token failed: ${res.body}`);
  return { email: who.email, sid: '', headers: { authorization: `Bearer ${res.json().data.token}` } };
}
const get = async (who: Person, path: string, params: Record<string, string> = {}) => {
  const res = await w.call(who, 'GET', `/v1/reports/${path}?${new URLSearchParams(params)}`);
  return res;
};
const report = async (who: Person, path: string, params: Record<string, string> = {}) => {
  const res = await get(who, path, params);
  if (res.statusCode !== 200) throw new Error(`${path} ${res.statusCode}: ${res.body}`);
  return res.json().data;
};
const csv = async (who: Person, path: string, params: Record<string, string> = {}) => {
  const res = await w.call(who, 'GET', `/v1/reports/${path}/export.csv?${new URLSearchParams(params)}`);
  if (res.statusCode !== 200) throw new Error(`${path} csv ${res.statusCode}: ${res.body}`);
  expect(res.headers['content-type']).toContain('text/csv');
  return res.body
    .trim()
    .split('\r\n')
    .map(line => line.split(','));
};
const issueCount = async (who: Person, q: string) =>
  (await w.call(who, 'GET', `/v1/issues?limit=1&q=${encodeURIComponent(q)}`)).json().meta.pagination.total as number;
const countOf = (groups: { label: string; count: number }[], label: string) =>
  groups.find(g => g.label === label)?.count ?? 0;

let outsiderToken: Person;
let restricted: Person;
const PERIOD = { from: '2026-09-07', to: '2026-09-08' };

beforeAll(async () => {
  w = await issueWorld(KEY);
  const a = w.admin.username;
  const c = w.contributor.username;
  await w.call(w.admin, 'POST', '/v1/projects', { name: 'Other Work', key: OTHER });

  const severity = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/custom-fields`, {
    name: 'Severity',
    type: 'select',
    options: [{ name: 'Low' }, { name: 'High' }],
  });
  if (severity.statusCode !== 201) throw new Error(severity.body);
  await w.call(w.admin, 'POST', `/v1/projects/${KEY}/custom-fields`, {
    name: 'Area',
    type: 'select',
    applies_to: ['Bug'],
    options: [{ name: 'Web' }],
  });

  // RP-1
  await create({
    title: 'Login fails',
    type: 'Bug',
    status: 'Open',
    assignees: [a, c],
    tags: ['auth'],
    start_date: '2026-09-01',
    due_date: '2026-09-10',
    estimate: '4h',
    custom_fields: { severity: 'High' },
  });
  // RP-2
  await create({
    title: 'Crash on save',
    type: 'Bug',
    status: 'In Progress',
    assignees: [c],
    start_date: '2026-09-05',
    due_date: '2026-09-20',
    custom_fields: { severity: 'Low' },
    links: [{ link: 'depends on', issues: [`${KEY}-1`] }],
  });
  // RP-3: resolved, due date only
  await create({ title: 'Write docs', type: 'Task', status: 'Fixed', tags: ['docs'], due_date: '2026-09-15' });
  // RP-4: deleted below, after time is logged on it
  await create({ title: 'Gone', type: 'Bug', assignees: [a], start_date: '2026-09-02', due_date: '2026-09-03' });
  // RP-5: a Bug with an Area that stops applying when it becomes a Task
  await create({ title: 'Moved area', type: 'Bug', custom_fields: { area: 'Web' } });
  await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-5`, { type: 'Task' });

  const other = await w.call(w.admin, 'POST', '/v1/issues', {
    project: OTHER,
    title: 'Other project bug',
    type: 'Bug',
    assignees: [a],
    start_date: '2026-09-01',
    due_date: '2026-09-02',
  });
  if (other.statusCode !== 201) throw new Error(other.body);

  await log(`${KEY}-1`, '2026-09-07', '2h', 'Development', w.contributor);
  await log(`${KEY}-2`, '2026-09-08', '1h', 'Testing');
  await log(`${OTHER}-1`, '2026-09-07', '3h');
  await log(`${KEY}-4`, '2026-09-07', '5h', 'Development');
  expect((await w.call(w.admin, 'DELETE', `/v1/issues/${KEY}-4`)).statusCode).toBe(200);

  // Another organisation with its own issue and time.
  const project = await w.call(w.outsider, 'POST', '/v1/projects', { name: 'Elsewhere', key: 'OX' });
  if (project.statusCode !== 201) throw new Error(project.body);
  await w.call(w.outsider, 'POST', '/v1/issues', {
    project: 'OX',
    title: 'Not yours',
    type: 'Bug',
    assignees: [],
    start_date: '2026-09-01',
    due_date: '2026-09-09',
  });
  const ox = await w.call(w.outsider, 'POST', '/v1/issues/OX-1/work-items', {
    records: [{ work_date: '2026-09-07', duration: '8h' }],
  });
  if (ox.statusCode !== 201) throw new Error(ox.body);

  await w.call(w.admin, 'POST', '/v1/saved-views', { name: 'Bugs', query: 'type: Bug', visibility: 'private' });

  outsiderToken = await token(w.outsider, ['issues:read']);
  restricted = await token(w.admin, ['issues:read'], [KEY]);
});

afterAll(() => w.close());

describe('issues per assignee', () => {
  test('counts an issue once per assignee and states the distinct total', async () => {
    const data = await report(w.admin, 'issues-per-assignee');
    expect(data.total_issues).toBe(5);
    expect(data.total_counted).toBe(6);
    expect(data.multi_valued_issues).toBe(1);
    const byUser = (username: string) => data.groups.find((g: { value: string }) => g.value === username)?.count;
    expect(byUser(w.admin.username)).toBe(2);
    expect(byUser(w.contributor.username)).toBe(2);
    expect(countOf(data.groups, 'Unassigned')).toBe(2);
    expect(data.groups.every((g: { series: number | null }) => g.series !== null)).toBe(true);

    const without = await report(w.admin, 'issues-per-assignee', { include_unassigned: 'false' });
    expect(without.total_issues).toBe(3);
    expect(countOf(without.groups, 'Unassigned')).toBe(0);
  });

  test('each group’s query lists exactly the issues it counts', async () => {
    const data = await report(w.admin, 'issues-per-assignee');
    for (const g of data.groups) expect(await issueCount(w.admin, g.query)).toBe(g.count);
  });
});

describe('never counts an issue the caller cannot open', () => {
  // RP-4 is soft-deleted, RQ is not the contributor's, OX is another organisation, the token is RP only.
  type Figures = { total_issues: number; total: number; overall: { count: number }; totals: { spent_minutes: number } };
  const cases: [string, Record<string, string>, (d: Figures) => number][] = [
    ['issues-per-assignee', {}, d => d.total_issues],
    ['issues-per-project', {}, d => d.total_issues],
    ['issues-per-field', { field: 'status' }, d => d.total_issues],
    ['matrix', { row_field: 'status', column_field: 'type' }, d => d.total_issues],
    ['average-age', { unresolved_only: 'false' }, d => d.overall.count],
    ['time', PERIOD, d => d.totals.spent_minutes],
    ['timesheet', PERIOD, d => d.total],
  ];
  const expected: Record<string, [admin: number, contributor: number, restricted: number, outsider: number]> = {
    'issues-per-assignee': [5, 4, 4, 1],
    'issues-per-project': [5, 4, 4, 1],
    'issues-per-field': [5, 4, 4, 1],
    matrix: [5, 4, 4, 1],
    'average-age': [5, 4, 4, 1],
    time: [360, 180, 180, 480],
    timesheet: [360, 180, 180, 480],
  };
  for (const [name, params, pick] of cases) {
    test(`${name}, JSON and CSV`, async () => {
      const callers = [w.admin, w.contributor, restricted, outsiderToken];
      for (const [i, who] of callers.entries()) {
        expect(pick(await report(who, name, params))).toBe(expected[name]![i]!);
        const rows = await csv(who, name, params);
        expect(rows.length).toBeGreaterThan(0);
      }
    });
  }

  test('the CSV carries the JSON’s numbers', async () => {
    const json = await report(w.contributor, 'issues-per-project');
    const rows = await csv(w.contributor, 'issues-per-project');
    expect(rows[0]).toEqual(['label', 'value', 'issues', 'share']);
    expect(rows.at(-1)).toEqual(['Total', '', String(json.total_issues), '']);
    expect(rows.find(r => r[1] === OTHER)).toBeUndefined();

    const time = await report(w.admin, 'time', { ...PERIOD, group_by: 'project' });
    const timeRows = await csv(w.admin, 'time', { ...PERIOD, group_by: 'project' });
    expect(timeRows.at(-1)![3]).toBe(String(time.totals.spent_minutes));
  });

  test('gantt, burndown and the timesheet drill-down stay inside the scope', async () => {
    const gantt = await report(w.admin, 'gantt', { project: KEY });
    const keys = [
      ...gantt.groups.flatMap((g: { bars: { key: string }[] }) => g.bars.map(b => b.key)),
      ...gantt.missing.issues.map((b: { key: string }) => b.key),
    ];
    expect(keys).not.toContain(`${KEY}-4`);
    expect(keys.every((k: string) => k.startsWith(`${KEY}-`))).toBe(true);
    expect((await get(w.contributor, 'gantt', { project: OTHER })).statusCode).toBe(404);
    expect((await get(restricted, 'gantt', { project: OTHER })).statusCode).toBe(404);
    expect((await get(outsiderToken, 'gantt', { project: KEY })).statusCode).toBe(404);
    expect((await get(w.outsider, 'burndown', { project: KEY })).statusCode).toBe(404);

    const items = await w.call(
      w.admin,
      'GET',
      `/v1/reports/timesheet/work-items?user=${w.admin.username}&from=2026-09-07&to=2026-09-07`,
    );
    expect(items.statusCode).toBe(200);
    expect(items.json().data.map((i: { issue: string }) => i.issue)).toEqual([`${OTHER}-1`]);
    const theirs = await w.call(
      restricted,
      'GET',
      `/v1/reports/timesheet/work-items?user=${w.admin.username}&from=2026-09-07&to=2026-09-07`,
    );
    expect(theirs.json().data).toEqual([]);
  });
});

describe('issues per field', () => {
  test('a custom field groups with its empty label, and only where it applies', async () => {
    const data = await report(w.admin, 'issues-per-field', { field: 'custom:severity' });
    expect(countOf(data.groups, 'High')).toBe(1);
    expect(countOf(data.groups, 'Low')).toBe(1);
    expect(countOf(data.groups, 'No Severity')).toBe(3);
    const high = data.groups.find((g: { label: string }) => g.label === 'High');
    expect(high.query).toContain('severity: High');
    expect(await issueCount(w.admin, high.query)).toBe(1);

    const area = await report(w.admin, 'issues-per-field', { field: 'custom:area', projects: KEY });
    expect(countOf(area.groups, 'Web')).toBe(0);
    expect(countOf(area.groups, 'No Area')).toBe(4);
  });

  test('status by category merges renamed statuses and links each category to its statuses', async () => {
    const data = await report(w.admin, 'issues-per-field', { field: 'status', by_category: 'true' });
    expect(data.palette).toBe('category');
    const unstarted = data.groups.find((g: { category: string }) => g.category === 'unstarted');
    expect(unstarted.count).toBe(3);
    expect(await issueCount(w.admin, unstarted.query)).toBe(3);
    const refused = await get(w.admin, 'issues-per-field', { field: 'priority', by_category: 'true' });
    expect(refused.json().error.code).toBe('report.by_category_status_only');
  });

  test('a field that cannot group answers with the ones that can', async () => {
    const res = await get(w.admin, 'issues-per-field', { field: 'custom:nothing' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.valid_values).toContain('custom:severity');
  });
});

describe('scope', () => {
  test('a saved view scopes by name; an unknown one lists the visible views', async () => {
    const data = await report(w.admin, 'issues-per-project', { view: 'Bugs' });
    expect(data.scope.view).toBe('Bugs');
    expect(countOf(data.groups, 'Acme Web')).toBe(2);
    expect(countOf(data.groups, 'Other Work')).toBe(1);
    const missing = await get(w.admin, 'issues-per-project', { view: 'Nope' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('report.unknown_view');
    expect(missing.json().error.valid_values).toContain('Bugs');
    expect(missing.json().error.field).toBe('view');
  });

  test('a bad value in the query answers with the valid ones', async () => {
    const res = await get(w.admin, 'issues-per-assignee', { q: 'priority: Urgent' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('query.invalid_value');
    expect(res.json().error.valid_values).toContain('Critical');
  });

  test('an empty report names the filter that produced nothing and how to widen it', async () => {
    const data = await report(w.admin, 'issues-per-assignee', { q: 'priority: Critical', projects: KEY });
    expect(data.total_issues).toBe(0);
    expect(data.empty.reason).toBe('no_issues');
    expect(data.empty.message).toBe('No issues match priority: Critical, in RP.');
    expect(data.empty.filters[0]).toEqual({ kind: 'clause', label: 'priority: Critical', widen_query: '' });
    expect(data.empty.filters[1].kind).toBe('projects');

    const onlyProjects = await report(w.admin, 'time', { period: '2026-01', projects: KEY });
    expect(onlyProjects.empty.message).toBe('No time was logged between 1 Jan 2026 and 31 Jan 2026 on issues in RP.');
    const both = await report(w.admin, 'time', { period: '2026-01', projects: KEY, q: 'type: Bug' });
    expect(both.empty.message).toBe(
      'No time was logged between 1 Jan 2026 and 31 Jan 2026 on issues matching type: Bug, in RP.',
    );
    const nobody = await report(w.admin, 'issues-per-assignee', { projects: KEY, q: 'created: 2001-01-01' });
    expect(nobody.empty.message).toBe('No issues match created: 2001-01-01, in RP.');
    const unresolved = await report(w.admin, 'average-age', { projects: KEY, q: '#Resolved' });
    expect(unresolved.empty.message).toBe('No issues match #Resolved, in RP, unresolved issues only.');
    const time = await report(w.admin, 'time', { period: '2026-01' });
    expect(time.empty.reason).toBe('no_time');
    expect(time.empty.message).toBe('No time was logged between 1 Jan 2026 and 31 Jan 2026.');
  });

  test('a write invalidates cached results through the data version', async () => {
    const before = await report(w.admin, 'issues-per-project', { projects: KEY });
    const again = await report(w.admin, 'issues-per-project', { projects: KEY });
    expect(again.generated_at).toBe(before.generated_at);
    const key = await create({ title: 'Fresh' });
    const after = await report(w.admin, 'issues-per-project', { projects: KEY });
    expect(after.total_issues).toBe(before.total_issues + 1);
    await w.call(w.admin, 'DELETE', `/v1/issues/${key}`);
    expect((await report(w.admin, 'issues-per-project', { projects: KEY })).total_issues).toBe(before.total_issues);
  });

  test('a write refused after it resolved the organisation still moves the data version', async () => {
    const versionKey = `report:v:${w.repos.ctx.orgId}`;
    const before = Number((await w.app.redis.get(versionKey)) ?? 0);
    const res = await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Nope', status: 'No Such Status' });
    expect(res.statusCode).toBe(400);
    expect(Number(await w.app.redis.get(versionKey))).toBe(before + 1);
    expect(await w.app.redis.ttl(versionKey)).toBeGreaterThan(0);
  });
});

describe('matrix', () => {
  test('cells count intersections and link to them', async () => {
    const data = await report(w.admin, 'matrix', { row_field: 'status', column_field: 'custom:severity' });
    const open = data.rows.groups.findIndex((g: { label: string }) => g.label === 'Open');
    const high = data.columns.groups.findIndex((g: { label: string }) => g.label === 'High');
    const cell = data.cells.find((c: { row: number; column: number }) => c.row === open && c.column === high);
    expect(cell.count).toBe(1);
    expect(await issueCount(w.admin, cell.query)).toBe(1);
    const rows = await csv(w.admin, 'matrix', { row_field: 'status', column_field: 'custom:severity' });
    expect(rows[0]![0]).toBe('status');
    expect(rows.at(-1)!.at(-1)).toBe(String(data.total_issues));
  });
});

describe('average age', () => {
  test('open issues by default, resolved ones to their resolution when asked', async () => {
    const open = await report(w.admin, 'average-age', { group_by: 'type' });
    expect(open.overall.count).toBe(4);
    expect(countOf(open.groups, 'Bug')).toBe(3);
    const all = await report(w.admin, 'average-age', { unresolved_only: 'false' });
    expect(all.overall.count).toBe(5);
    expect(all.overall.average_days).toBeGreaterThanOrEqual(0);
  });
});

describe('time', () => {
  test('sums work items by work type, never the deleted issue’s time', async () => {
    const data = await report(w.admin, 'time', { ...PERIOD, group_by: 'work_type' });
    const row = (label: string) => data.rows.find((r: { label: string }) => r.label === label);
    expect(row('Development').spent_minutes).toBe(300);
    expect(row('Testing').spent_minutes).toBe(60);
    expect(row('Development').estimate_minutes).toBeNull();
    expect(data.totals.spent_minutes).toBe(360);
    expect(data.scope.period).toEqual({ from: PERIOD.from, to: PERIOD.to });
  });

  test('by project with the estimate, difference and share', async () => {
    const data = await report(w.admin, 'time', { ...PERIOD, group_by: 'project' });
    const rp = data.rows.find((r: { value: string }) => r.value === KEY);
    expect(rp.spent_minutes).toBe(180);
    expect(rp.estimate_minutes).toBe(240);
    expect(rp.difference_minutes).toBe(60);
    expect(rp.share).toBe(50);
    expect(data.estimate_sources.map((s: { field: string | null }) => s.field)).toEqual([null, null]);
  });

  test('by user and by issue; periods are checked', async () => {
    const byUser = await report(w.admin, 'time', { ...PERIOD, group_by: 'user' });
    expect(byUser.rows.find((r: { value: string }) => r.value === w.contributor.username).spent_minutes).toBe(120);
    const byIssue = await report(w.admin, 'time', { ...PERIOD, group_by: 'issue' });
    expect(byIssue.rows.map((r: { value: string }) => r.value).sort()).toEqual([`${KEY}-1`, `${KEY}-2`, `${OTHER}-1`]);
    const long = await get(w.admin, 'time', { from: '2025-01-01', to: '2026-09-01' });
    expect(long.json().error.code).toBe('report.period_too_long');
    const half = await get(w.admin, 'time', { from: '2026-09-01' });
    expect(half.json().error.code).toBe('report.period_incomplete');
    const nonsense = await get(w.admin, 'time', { period: 'soonish' });
    expect(nonsense.json().error.code).toBe('report.invalid_period');
    const attribute = await get(w.admin, 'time', { group_by: 'attribute:Billable' });
    expect(attribute.json().error.code).toBe('report.unknown_attribute');
  });
});

describe('timesheet', () => {
  test('users by days with totals both ways', async () => {
    const data = await report(w.admin, 'timesheet', {
      ...PERIOD,
      users: `${w.admin.username},${w.contributor.username},${w.observer.username}`,
    });
    expect(data.days.map((d: { date: string }) => d.date)).toEqual([PERIOD.from, PERIOD.to]);
    const row = (username: string) =>
      data.rows.find((r: { member: { username: string } }) => r.member.username === username);
    expect(row(w.admin.username).minutes).toEqual([180, 60]);
    expect(row(w.contributor.username).minutes).toEqual([120, 0]);
    expect(row(w.observer.username).total).toBe(0);
    expect(data.day_totals).toEqual([300, 60]);
    expect(data.total).toBe(360);
    const unknown = await get(w.admin, 'timesheet', { users: 'nobody' });
    expect(unknown.json().error.code).toBe('report.unknown_user');
    expect(unknown.json().error.valid_values).toContain(w.admin.username);
  });
});

describe('gantt', () => {
  test('bars, dependency arrows and the separate missing-dates list', async () => {
    const data = await report(w.admin, 'gantt', { project: KEY, group_by: 'assignee' });
    expect(data.bar_count).toBe(2);
    expect(data.dependencies).toEqual([{ from: `${KEY}-1`, to: `${KEY}-2` }]);
    expect(data.missing.count).toBe(2);
    expect(data.missing.issues.map((b: { key: string }) => b.key).sort()).toEqual([`${KEY}-3`, `${KEY}-5`]);
    expect(data.range).toEqual({ start: '2026-09-01', end: '2026-09-20' });
    const empty = await report(w.admin, 'gantt', { project: KEY, q: '#Resolved' });
    expect(empty.empty.reason).toBe('no_dates');
  });
});

describe('burndown', () => {
  test('reads snapshots, adds a live point and shows added scope as its own series', async () => {
    const end = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, { name: 'Sprint 1', end_date: end });
    const planned = await report(w.admin, 'burndown', { project: KEY, sprint: 'Sprint 1' });
    expect(planned.empty.reason).toBe('no_snapshots');
    await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-1`, { sprint: 'Sprint 1', story_points: 3 });
    await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-2`, { sprint: 'Sprint 1', story_points: 5 });
    expect((await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/sprint-1/start`)).statusCode).toBe(200);
    await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-5`, { sprint: 'Sprint 1', story_points: 2 });

    const data = await report(w.admin, 'burndown', { project: KEY });
    expect(data.sprint.name).toBe('Sprint 1');
    const today = data.days.find((d: { live: boolean }) => d.live);
    expect(today.remaining).toBe(10);
    expect(today.scope).toBe(10);
    expect(today.scope_added).toBe(2);
    expect(data.summary.start_scope).toBe(8);

    const issues = await report(w.admin, 'burndown', { project: KEY, measure: 'issue_count' });
    expect(issues.summary.start_scope).toBe(2);
    expect(issues.days.find((d: { live: boolean }) => d.live).scope).toBe(3);
    expect(issues.days.at(-1).date).toBe(end);
    expect(issues.days.at(-1).ideal).toBe(0);
    const estimate = await report(w.admin, 'burndown', { project: KEY, measure: 'remaining_estimate' });
    expect(estimate.unit).toBe('minutes');
    expect(estimate.days.find((d: { live: boolean }) => d.live).remaining).toBe(240);
    expect(estimate.summary.start_scope).toBe(240);
    const unknown = await get(w.admin, 'burndown', { project: KEY, sprint: 'Nope' });
    expect(unknown.json().error.valid_values).toContain('Sprint 1');
    const rows = await csv(w.admin, 'burndown', { project: KEY });
    expect(rows[0]).toEqual(['date', 'remaining', 'ideal', 'scope', 'scope_added', 'completed', 'live']);
  });
});

describe('burndown axis', () => {
  test('a sprint started on an earlier named day runs from that day', async () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    await w.call(w.admin, 'POST', `/v1/projects/${OTHER}/sprints`, { name: 'Backdated', end_date: day(7) });
    await w.call(w.admin, 'PATCH', `/v1/issues/${OTHER}-1`, { sprint: 'Backdated', story_points: 4 });
    const started = await w.call(w.admin, 'POST', `/v1/projects/${OTHER}/sprints/backdated/start`, {
      start_date: day(-3),
    });
    expect(started.statusCode).toBe(200);
    const data = await report(w.admin, 'burndown', { project: OTHER });
    expect(data.days[0].date).toBe(day(-3));
    expect(data.summary.start_scope).toBe(4);
    expect(data.days.find((d: { live: boolean }) => d.live).scope_added).toBe(0);
  });
});

describe('permissions', () => {
  test('every role reads and exports; a token without issues:read is told the scope', async () => {
    expect((await get(w.observer, 'issues-per-project')).statusCode).toBe(200);
    expect((await w.call(w.observer, 'GET', '/v1/reports/issues-per-project/export.csv')).statusCode).toBe(200);
    const timeOnly = await token(w.admin, ['time:write']);
    const res = await get(timeOnly, 'issues-per-project');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('token.scope_missing');
    expect(res.json().error.scope).toBe('issues:read');
    const csvRes = await w.call(timeOnly, 'GET', '/v1/reports/timesheet/export.csv');
    expect(csvRes.statusCode).toBe(403);
    expect((await w.call({ email: '', sid: '', headers: {} }, 'GET', '/v1/reports/time')).statusCode).toBe(401);
  });

  test('a project the caller cannot read is absent, not forbidden', async () => {
    const res = await get(w.contributor, 'issues-per-assignee', { projects: OTHER });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('project.not_found');
  });

  test('one unreadable key among several fails exactly as that key alone does', async () => {
    const outcome = async (who: Person, projects: string) => {
      const res = await get(who, 'issues-per-assignee', { projects });
      const error = res.json().error;
      delete error.request_id;
      return { status: res.statusCode, error };
    };
    const cases: [Person, string, string[]][] = [
      [w.contributor, OTHER, [`${KEY},${OTHER}`, `${OTHER},${KEY}`]],
      [restricted, OTHER, [`${KEY},${OTHER}`, `${OTHER},${KEY}`]],
      [w.admin, 'NOPE', [`${KEY},NOPE`, `NOPE,${OTHER}`]],
      [outsiderToken, KEY, [`OX,${KEY}`]],
    ];
    for (const [who, alone, mixes] of cases) {
      const single = await outcome(who, alone);
      expect(single.status).toBe(404);
      expect(single.error.code).toBe('project.not_found');
      for (const mixed of mixes) expect(await outcome(who, mixed)).toEqual(single);
    }
    expect((await get(w.admin, 'issues-per-assignee', { projects: `${KEY},${OTHER}` })).statusCode).toBe(200);
  });
});
