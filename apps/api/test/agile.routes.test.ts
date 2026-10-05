import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { PatScope } from '@nothingleft/types';
import { ranksBetween } from '../src/services/sprint-placement.ts';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import type { Person } from './people.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'AGL';

const newIssue = async (extra: object = {}, who: Person = w.admin) => {
  const res = await w.call(who, 'POST', '/v1/issues', { project: KEY, title: 'Card', ...extra });
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
  return res.json().data.key as string;
};
const createSprint = async (name: string, extra: object = {}) => {
  const res = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, { name, ...extra });
  if (res.statusCode !== 201) throw new Error(`sprint create failed: ${res.body}`);
  return res.json().data;
};
const container = async (sprint?: string, q = '') => {
  const params = new URLSearchParams({ limit: '100', ...(sprint ? { sprint } : {}), ...(q ? { q } : {}) });
  const res = await w.call(w.admin, 'GET', `/v1/projects/${KEY}/backlog?${params}`);
  expect(res.statusCode).toBe(200);
  return (res.json().data as { key: string }[]).map(i => i.key);
};
const move = (body: object, who: Person = w.admin) => w.call(who, 'POST', `/v1/projects/${KEY}/backlog/move`, body);
const sprintChanges = async (key: string) =>
  (await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?kind=sprint_changed&limit=50`)).json().data as {
    old_value: { name: string } | null;
    new_value: { name: string } | null;
  }[];
const search = async (q: string) =>
  (
    (await w.call(w.admin, 'GET', `/v1/issues?project=${KEY}&limit=100&q=${encodeURIComponent(q)}`)).json().data as {
      key: string;
    }[]
  ).map(i => i.key);

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

describe('ranksBetween', () => {
  test('midpoints between neighbours, steps at either end, null when too tight', () => {
    expect(ranksBetween(1, 2, 1)).toEqual([1.5]);
    expect(ranksBetween(1, 2, 3)).toEqual([1.25, 1.5, 1.75]);
    expect(ranksBetween(null, 5, 2)).toEqual([3, 4]);
    expect(ranksBetween(5, null, 2)).toEqual([6, 7]);
    expect(ranksBetween(null, null, 2)).toEqual([1, 2]);
    expect(ranksBetween(1, 1 + 1e-7, 1)).toBeNull();
  });
});

describe('the default board', () => {
  test('every new project gets one, three columns by category, lanes by Epic', async () => {
    const res = await w.call(w.observer, 'GET', `/v1/projects/${KEY}/boards`);
    expect(res.statusCode).toBe(200);
    const [board] = res.json().data;
    expect(board.slug).toBe(KEY.toLowerCase());
    expect(board.columns.map((c: { name: string }) => c.name)).toEqual(['To do', 'In progress', 'Done']);
    expect(board.columns[0].values.map((s: { name: string }) => s.name)).toContain('Open');
    expect(board.columns[2].resolved).toBe(true);
    expect(board.columns[0].resolved).toBe(false);
    expect(board.unmapped_values).toEqual([]);
    expect(board.swimlane_by).toBe('issues');
    expect(board.swimlane_types).toEqual(['Epic']);
    const short = await w.call(w.contributor, 'GET', `/v1/boards/${board.slug}`);
    expect(short.json().data.project.key).toBe(KEY);
    expect((await w.call(w.outsider, 'GET', `/v1/boards/${board.slug}`)).statusCode).toBe(404);
  });
});

describe('sprints', () => {
  test('create, slug, unscheduled dates, name clash, bad dates, goal size', async () => {
    const s = await createSprint('September 2026', { goal_md: 'Ship **checkout**' });
    expect(s).toMatchObject({ slug: 'september-2026', state: 'planned', start_date: null, end_date: null });
    expect(s.progress.issues).toBe(0);
    const clash = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, { name: 'september 2026' });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().error.code).toBe('sprint.name_taken');
    const dates = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, {
      name: 'Backwards',
      start_date: '2026-10-10',
      end_date: '2026-10-01',
    });
    expect(dates.json().error.code).toBe('sprint.dates_out_of_order');
    const goal = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, {
      name: 'Wordy',
      goal_md: 'x'.repeat(17 * 1024),
    });
    expect(goal.json().error.code).toBe('sprint.goal_too_large');
    const read = await w.call(w.observer, 'GET', `/v1/projects/${KEY}/sprints/September%202026`);
    expect(read.json().data.slug).toBe('september-2026');
    expect(read.json().data.snapshots).toEqual([]);
    const missing = await w.call(w.admin, 'GET', `/v1/projects/${KEY}/sprints/nope`);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.valid_values).toContain('September 2026');
  });

  test('an issue joins a sprint through PATCH and creation, with sprint_changed and story points', async () => {
    const a = await newIssue({ sprint: 'september-2026', story_points: 3 });
    const created = (await w.call(w.admin, 'GET', `/v1/issues/${a}`)).json().data;
    expect(created.sprint).toEqual({ name: 'September 2026', slug: 'september-2026', state: 'planned' });
    expect(created.story_points).toBe(3);
    const b = await newIssue();
    const res = await w.call(w.contributor, 'PATCH', `/v1/issues/${b}`, { sprint: 'September 2026', story_points: 5 });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.sprint.slug).toBe('september-2026');
    expect(await sprintChanges(b)).toEqual([
      expect.objectContaining({ old_value: null, new_value: { name: 'September 2026', slug: 'september-2026' } }),
    ]);
    const bad = await w.call(w.admin, 'PATCH', `/v1/issues/${b}`, { sprint: 'Nope' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatchObject({ code: 'issue.unknown_sprint', valid_values: ['September 2026'] });
    const tooMany = await w.call(w.admin, 'PATCH', `/v1/issues/${b}`, { story_points: 1000 });
    expect(tooMany.statusCode).toBe(400);
    expect(await container('september-2026')).toEqual([a, b]);
    const back = await w.call(w.admin, 'PATCH', `/v1/issues/${b}`, { sprint: null });
    expect(back.json().data.sprint).toBeNull();
    await w.call(w.admin, 'PATCH', `/v1/issues/${b}`, { sprint: 'september-2026' });
  });

  test('story points roll up to the parent; subtask progress counts live children', async () => {
    const epic = await newIssue({ type: 'Epic' });
    const one = await newIssue({ parent: epic, story_points: 2 });
    await newIssue({ parent: epic, story_points: 5 });
    await w.call(w.admin, 'PATCH', `/v1/issues/${one}`, { status: 'Fixed' });
    const read = (await w.call(w.admin, 'GET', `/v1/issues/${epic}`)).json().data;
    expect(read.story_points_rollup).toBe(7);
    expect(read.subtasks).toEqual({ resolved: 1, total: 2 });
  });
});

describe('backlog ordering', () => {
  test('drag to the top, between, to the bottom and into a sprint', async () => {
    const keys: [string, string, string] = [await newIssue(), await newIssue(), await newIssue()];
    const before = await container(undefined, '#Unresolved');
    expect(before.slice(-3)).toEqual(keys);
    const top = await move({ issues: [keys[2]], before: before[0] });
    expect(top.statusCode).toBe(200);
    expect((await container(undefined, '#Unresolved'))[0]).toBe(keys[2]);
    await move({ issues: [keys[0]], after: keys[1] });
    const now = await container(undefined, '#Unresolved');
    expect(now.indexOf(keys[0])).toBe(now.indexOf(keys[1]) + 1);
    const planned = await container('september-2026');
    const into = await move({ issues: [keys[1]], sprint: 'September 2026', before: planned[0] });
    expect(into.statusCode).toBe(200);
    expect(into.json().data[0].sprint.slug).toBe('september-2026');
    expect((await container('september-2026'))[0]).toBe(keys[1]);
    expect(await sprintChanges(keys[1])).toHaveLength(1);
  });

  test('anchors must sit in the target container and not be moving; keys belong to the project', async () => {
    const [x, y] = [await newIssue(), await newIssue()];
    const inSprint = (await container('september-2026'))[0]!;
    expect((await move({ issues: [x], sprint: null, after: inSprint })).json().error.code).toBe(
      'backlog.anchor_not_in_container',
    );
    expect((await move({ issues: [x, y], after: y })).json().error.code).toBe('backlog.anchor_moving');
    expect((await move({ issues: ['ZZZ-1'] })).json().error.code).toBe('backlog.issue_other_project');
    expect((await move({ issues: [x, x] })).json().error.code).toBe('backlog.duplicate_issue');
  });

  test('many drops into one gap renumber the container rather than lose precision', async () => {
    const [a, b, c] = [await newIssue(), await newIssue(), await newIssue()];
    await createSprint('Tight');
    await move({ issues: [a, b], sprint: 'tight' });
    for (let i = 0; i < 40; i += 1) {
      await move({ issues: [i % 2 ? c : a], sprint: 'tight', after: i % 2 ? a : c });
    }
    const order = await container('tight');
    expect(order).toHaveLength(3);
    expect(new Set(order).size).toBe(3);
  });
});

describe('start and finish', () => {
  test('start needs an end date, sets today, takes a snapshot; one active per project', async () => {
    const noEnd = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/september-2026/start`, {});
    expect(noEnd.json().error.code).toBe('sprint.end_date_required');
    const started = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/september-2026/start`, {
      end_date: '2099-09-30',
    });
    expect(started.statusCode).toBe(200);
    const s = started.json().data;
    expect(s.state).toBe('active');
    expect(s.start_date).toBe(new Date().toISOString().slice(0, 10));
    expect(s.days_left).toBeGreaterThan(0);
    expect(s.snapshots).toHaveLength(1);
    expect(s.progress.points).toBeGreaterThanOrEqual(8);
    await createSprint('October 2026', { start_date: '2099-10-01', end_date: '2099-10-14' });
    const second = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/october-2026/start`);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('sprint.active_exists');
    expect((await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/september-2026/start`)).statusCode).toBe(409);
  });

  test('the board reads the active sprint: filter-aware counts, WIP totals, lanes', async () => {
    const epic = await newIssue({ type: 'Epic', title: 'Checkout', sprint: 'september-2026' });
    await newIssue({ parent: epic, sprint: 'september-2026', assignees: [w.contributor.username] });
    const res = await w.call(w.observer, 'GET', `/v1/projects/${KEY}/boards/${KEY.toLowerCase()}/view`);
    expect(res.statusCode).toBe(200);
    const view = res.json().data;
    expect(view.sprint.slug).toBe('september-2026');
    const total = view.columns.reduce((n: number, c: { total: number }) => n + c.total, 0);
    expect(total).toBe(view.sprint.progress.issues);
    const lane = view.lanes.find((l: { key: string | null }) => l.key === epic);
    expect(lane.kind).toBe('issue');
    expect(lane.issue.key).toBe(epic);
    expect(lane.count).toBe(1);
    expect(view.lanes.at(-1).kind).toBe('uncategorized');
    expect(view.distribution.length).toBeGreaterThan(0);

    const filtered = (
      await w.call(
        w.admin,
        'GET',
        `/v1/projects/${KEY}/boards/${KEY.toLowerCase()}/view?q=${encodeURIComponent(`assignee: ${w.contributor.username}`)}&swimlane_by=values&swimlane_field=assignee`,
      )
    ).json().data;
    const count = filtered.columns.reduce((n: number, c: { count: number }) => n + c.count, 0);
    expect(count).toBe(1);
    expect(filtered.lanes[0]).toMatchObject({ kind: 'value', key: w.contributor.username, count: 1 });
  });

  test('query language: sprint:, #{Sprint}, {No sprint}, group by sprint, bad value', async () => {
    const inSprint = await search('sprint: {September 2026}');
    expect(inSprint.length).toBeGreaterThan(0);
    expect(await search('#{September 2026}')).toEqual(inSprint);
    const none = await search('sprint: {No sprint}');
    expect(none.some(k => inSprint.includes(k))).toBe(false);
    const bad = await w.call(w.admin, 'GET', `/v1/issues?q=${encodeURIComponent('sprint: {Nope}')}`);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('query.invalid_value');
    expect(bad.json().error.valid_values).toContain('September 2026');
    const grouped = await w.call(w.admin, 'GET', `/v1/issues?project=${KEY}&group_by=sprint`);
    expect(grouped.json().meta.groups.map((g: { label: string }) => g.label)).toContain('September 2026');
    expect(grouped.json().meta.groups.at(-1).label).toBe('No sprint');
  });

  test('finish moves the unfinished to a planned sprint, refusing anything else', async () => {
    const done = await newIssue({ sprint: 'september-2026' });
    await w.call(w.admin, 'PATCH', `/v1/issues/${done}`, { status: 'Fixed' });
    const bad = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/september-2026/finish`, {
      move_unfinished_to: 'september-2026',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.valid_values).toEqual(expect.arrayContaining(['backlog', 'October 2026']));
    const unfinished = (
      await w.call(w.admin, 'GET', `/v1/issues?q=${encodeURIComponent('sprint: september-2026 #Unresolved')}&limit=100`)
    )
      .json()
      .data.map((i: { key: string }) => i.key);
    const res = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/september-2026/finish`, {
      move_unfinished_to: 'October 2026',
    });
    expect(res.statusCode).toBe(200);
    const result = res.json().data;
    expect(result.sprint.state).toBe('completed');
    expect(result.moved_to.slug).toBe('october-2026');
    expect(result.moved.sort()).toEqual(unfinished.sort());
    expect((await w.call(w.admin, 'GET', `/v1/issues/${done}`)).json().data.sprint.slug).toBe('september-2026');
    const history = await sprintChanges(unfinished[0]!);
    expect(history.at(-1)).toMatchObject({ new_value: { name: 'October 2026' } });
    const late = await w.call(w.admin, 'PATCH', `/v1/issues/${done}`, { sprint: 'september-2026' });
    expect(late.json().error?.code ?? null).toBeNull();
    const into = await w.call(w.admin, 'PATCH', `/v1/issues/${unfinished[0]}`, { sprint: 'september-2026' });
    expect(into.statusCode).toBe(409);
    expect(into.json().error.code).toBe('sprint.completed');
    expect(
      (
        await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/september-2026/finish`, {
          move_unfinished_to: 'backlog',
        })
      ).json().error.code,
    ).toBe('sprint.not_active');
  });

  test('a new sprint takes another sprint’s unresolved issues; a planned sprint deletes to the backlog', async () => {
    const carried = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, {
      name: 'November 2026',
      add_unresolved_from: 'October 2026',
    });
    expect(carried.statusCode).toBe(201);
    const moved = carried.json().data.progress.issues;
    expect(moved).toBeGreaterThan(0);
    expect((await w.call(w.admin, 'GET', `/v1/projects/${KEY}/sprints/october-2026`)).json().data.progress.issues).toBe(
      0,
    );
    const inNovember = await container('november-2026');
    const deleted = await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/sprints/november-2026`);
    expect(deleted.statusCode).toBe(200);
    expect((await w.call(w.admin, 'GET', `/v1/issues/${inNovember[0]}`)).json().data.sprint).toBeNull();
    expect((await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/sprints/september-2026`)).json().error.code).toBe(
      'sprint.delete_not_planned',
    );
  });

  test('the nightly snapshot writes a row for every active sprint', async () => {
    await createSprint('Snap', { end_date: '2099-12-31' });
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints/snap/start`);
    expect(await w.app.jobHandlers['sprint.snapshot']()).toBeGreaterThan(0);
    const s = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/sprints/snap`)).json().data;
    expect(s.snapshots.length).toBe(2);
    const across = (await w.call(w.contributor, 'GET', '/v1/sprints?state=active')).json().data;
    expect(across.map((x: { project: { key: string } }) => x.project.key)).toContain(KEY);
  });
});

describe('boards', () => {
  test('create with columns, WIP, swimlanes; the checks name what is wrong', async () => {
    const res = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/boards`, {
      name: 'Delivery',
      columns: [
        { name: 'Open', values: ['Open', 'Reopened'] },
        { name: 'Doing', values: ['In Progress'], wip_max: 3 },
        { name: 'Done', values: ['Fixed', 'Closed'] },
      ],
      swimlane_by: 'values',
      swimlane_field: 'priority',
    });
    expect(res.statusCode).toBe(201);
    const b = res.json().data;
    expect(b.slug).toBe('delivery');
    expect(b.columns[1]).toMatchObject({ name: 'Doing', wip_max: 3, wip_min: null });
    expect(b.unmapped_values.map((s: { name: string }) => s.name)).toContain('Submitted');
    const post = (body: object) => w.call(w.admin, 'POST', `/v1/projects/${KEY}/boards`, body);
    expect((await post({ name: 'delivery' })).json().error.code).toBe('board.name_taken');
    const unknown = await post({ name: 'X', columns: [{ name: 'A', values: ['Done-ish'] }] });
    expect(unknown.json().error).toMatchObject({ code: 'board.unknown_value' });
    expect(unknown.json().error.valid_values).toContain('Open');
    expect(
      (
        await post({
          name: 'X',
          columns: [
            { name: 'A', values: ['Open'] },
            { name: 'B', values: ['open'] },
          ],
        })
      ).json().error.code,
    ).toBe('board.value_twice');
    expect((await post({ name: 'X', swimlane_by: 'values' })).json().error.code).toBe('board.swimlane_field_required');
    expect(
      (await post({ name: 'X', columns: [{ name: 'A', values: ['Open'], wip_min: 5, wip_max: 2 }] })).json().error.code,
    ).toBe('board.wip_out_of_order');
  });

  test('update replaces columns in order and renames; delete returns the board', async () => {
    const res = await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/boards/delivery`, {
      name: 'Delivery flow',
      columns: [
        { name: 'Doing', values: ['In Progress'] },
        { name: 'Open', values: ['Open'], collapsed_by_default: true },
      ],
      swimlane_by: 'none',
    });
    expect(res.statusCode).toBe(200);
    const b = res.json().data;
    expect(b).toMatchObject({
      name: 'Delivery flow',
      slug: 'delivery-flow',
      swimlane_by: 'none',
      swimlane_field: null,
    });
    expect(b.columns.map((c: { name: string }) => c.name)).toEqual(['Doing', 'Open']);
    expect(b.columns[1].collapsed_by_default).toBe(true);
    const view = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/boards/delivery-flow/view?sprint=snap`)).json()
      .data;
    expect(view.lanes).toHaveLength(1);
    expect(view.lanes[0].kind).toBe('all');
    const gone = await w.call(w.admin, 'DELETE', `/v1/projects/${KEY}/boards/delivery-flow`);
    expect(gone.json().data.name).toBe('Delivery flow');
    expect((await w.call(w.admin, 'GET', `/v1/projects/${KEY}/boards/delivery-flow`)).statusCode).toBe(404);
  });
});

describe('boards by priority or type', () => {
  test('columns by priority: one per value by default, cards placed by priority, WIP by priority', async () => {
    const res = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/boards`, {
      name: 'Triage',
      column_field: 'priority',
    });
    expect(res.statusCode).toBe(201);
    const b = res.json().data;
    expect(b.column_field).toBe('priority');
    expect(b.columns.map((c: { name: string }) => c.name)).toEqual([
      'Show-stopper',
      'Critical',
      'Major',
      'Normal',
      'Minor',
    ]);
    expect(b.columns[0].values[0]).toMatchObject({ name: 'Show-stopper', category: null });
    expect(b.columns.every((c: { resolved: boolean }) => !c.resolved)).toBe(true);
    expect(b.unmapped_values).toEqual([]);

    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/boards/triage`, {
      columns: [
        { name: 'Hot', values: ['Show-stopper', 'Critical'], wip_max: 1 },
        { name: 'Normal', values: ['Normal'] },
      ],
    });
    await newIssue({ sprint: 'snap', priority: 'Critical' });
    await newIssue({ sprint: 'snap', priority: 'Critical' });
    await newIssue({ sprint: 'snap', priority: 'Minor' });
    const view = (
      await w.call(w.admin, 'GET', `/v1/projects/${KEY}/boards/triage/view?sprint=snap&swimlane_by=none`)
    ).json().data;
    const hot = view.columns.find((c: { name: string }) => c.name === 'Hot');
    expect(hot.total).toBeGreaterThanOrEqual(2);
    expect(hot.over_wip_max).toBe(true);
    const cells = view.lanes[0].cells.find((c: { column: string }) => c.column === 'Hot').cards;
    expect(
      cells.every((c: { priority: { name: string } }) => ['Show-stopper', 'Critical'].includes(c.priority.name)),
    ).toBe(true);
    expect(view.unmapped.map((u: { name: string; category: null }) => [u.name, u.category])).toContainEqual([
      'Minor',
      null,
    ]);
    expect(view.distribution.every((d: { category: string }) => d.category !== null)).toBe(true);
  });

  test('a new column_field without columns seeds one column per value; values must be of that field', async () => {
    const res = await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/boards/triage`, { column_field: 'type' });
    expect(res.json().data.columns.map((c: { name: string }) => c.name)).toEqual(['Bug', 'Feature', 'Task', 'Epic']);
    const wrong = await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/boards/triage`, {
      columns: [{ name: 'X', values: ['Critical'] }],
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toMatchObject({
      code: 'board.unknown_value',
      valid_values: ['Bug', 'Feature', 'Task', 'Epic'],
    });
  });

  test('lanes by the same field as the columns are refused, in settings and in the view', async () => {
    const lanes = await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/boards/triage`, {
      swimlane_by: 'values',
      swimlane_field: 'type',
    });
    expect(lanes.statusCode).toBe(400);
    expect(lanes.json().error).toMatchObject({
      code: 'board.swimlane_same_as_columns',
      valid_values: ['assignee', 'priority'],
    });
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/boards/triage`, {
      swimlane_by: 'values',
      swimlane_field: 'priority',
    });
    const refield = await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/boards/triage`, { column_field: 'priority' });
    expect(refield.json().error.code).toBe('board.swimlane_same_as_columns');
    const view = await w.call(
      w.admin,
      'GET',
      `/v1/projects/${KEY}/boards/triage/view?sprint=snap&swimlane_by=values&swimlane_field=type`,
    );
    expect(view.json().error.code).toBe('board.swimlane_same_as_columns');
  });
});

describe('permissions', () => {
  test('Contributors plan; only Project Admins manage sprints and boards; Observers read', async () => {
    const key = await newIssue();
    expect((await move({ issues: [key], sprint: 'October 2026' }, w.contributor)).statusCode).toBe(200);
    expect((await move({ issues: [key], sprint: null }, w.observer)).statusCode).toBe(403);
    const create = await w.call(w.contributor, 'POST', `/v1/projects/${KEY}/sprints`, { name: 'Mine' });
    expect(create.statusCode).toBe(403);
    expect((await w.call(w.contributor, 'POST', `/v1/projects/${KEY}/boards`, { name: 'Mine' })).statusCode).toBe(403);
    expect(
      (await w.call(w.projectAdmin, 'POST', `/v1/projects/${KEY}/sprints`, { name: 'PA sprint' })).statusCode,
    ).toBe(201);
    expect((await w.call(w.observer, 'GET', `/v1/projects/${KEY}/sprints`)).statusCode).toBe(200);
    expect((await w.call(w.outsider, 'GET', `/v1/projects/${KEY}/sprints`)).statusCode).toBe(404);
    expect((await w.call(w.outsider, 'GET', `/v1/projects/${KEY}/boards/${KEY.toLowerCase()}/view`)).statusCode).toBe(
      404,
    );
  });

  test('a token without admin:project is told which scope it lacks', async () => {
    const pat = await token(w.admin, ['issues:read', 'issues:write']);
    const res = await w.call(pat, 'POST', `/v1/projects/${KEY}/sprints`, { name: 'Token sprint' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'admin:project' });
    const readOnly = await token(w.admin, ['issues:read']);
    const moved = await w.call(readOnly, 'POST', `/v1/projects/${KEY}/backlog/move`, { issues: [`${KEY}-1`] });
    expect(moved.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'issues:write' });
  });

  test('an archived project refuses planning', async () => {
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/archive`);
    const res = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, { name: 'Frozen' });
    expect(res.json().error.code).toBe('project.archived');
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/unarchive`);
  });
});

describe('names under concurrency, and swimlane shape', () => {
  // The slug key predates the name key and is checked first, so a race between equal slugs answers the generic conflict.
  const friendly = (code: string) => (r: Awaited<ReturnType<IssueWorld['call']>>) =>
    expect([code, 'conflict']).toContain(r.json().error.code);

  test('concurrent sprints and boards of one name leave one row', async () => {
    const sprints = await Promise.all(
      ['Hotfix', 'hotfix', 'HOTFIX'].map(name => w.call(w.admin, 'POST', `/v1/projects/${KEY}/sprints`, { name })),
    );
    expect(sprints.filter(r => r.statusCode === 201)).toHaveLength(1);
    sprints.filter(r => r.statusCode !== 201).forEach(friendly('sprint.name_taken'));

    const boards = await Promise.all(
      ['Ops', 'ops', 'OPS'].map(name => w.call(w.admin, 'POST', `/v1/projects/${KEY}/boards`, { name })),
    );
    expect(boards.filter(r => r.statusCode === 201)).toHaveLength(1);
    boards.filter(r => r.statusCode !== 201).forEach(friendly('board.name_taken'));
  });

  test('switching swimlanes keeps swimlane_field in step, and values without a field is a 400', async () => {
    const created = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/boards`, { name: 'Lanes' });
    expect(created.statusCode).toBe(201);
    const url = `/v1/projects/${KEY}/boards/${created.json().data.slug}`;
    const byValues = await w.call(w.admin, 'PATCH', url, { swimlane_by: 'values', swimlane_field: 'assignee' });
    expect(byValues.json().data).toMatchObject({ swimlane_by: 'values', swimlane_field: 'assignee' });
    const byNone = await w.call(w.admin, 'PATCH', url, { swimlane_by: 'none' });
    expect(byNone.statusCode).toBe(200);
    expect(byNone.json().data).toMatchObject({ swimlane_by: 'none', swimlane_field: null });
    const bare = await w.call(w.admin, 'PATCH', url, { swimlane_by: 'values' });
    expect(bare.statusCode).toBe(400);
    expect(bare.json().error.code).toBe('board.swimlane_field_required');
  });
});
