import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { WORK_ITEM_NOTE_MAX_BYTES, type PatScope } from '@nothingleft/types';
import { issueWorld, type IssueWorld, type Member } from './issue-world.ts';
import type { Person } from './people.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'WRK';

interface Item {
  id: number;
  issue: string;
  author: { username: string };
  created_by: { username: string };
  work_date: string;
  duration_minutes: number;
  work_type: { name: string; short_label: string } | null;
  description_md: string;
  me: { can_edit: boolean; can_delete: boolean };
}

const newIssue = async (extra: object = {}) =>
  (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Checkout times out', ...extra })).json().data
    .key as string;
const log = (key: string, body: object, who: Person = w.contributor) =>
  w.call(who, 'POST', `/v1/issues/${key}/work-items`, body);
const logOne = async (key: string, duration: string | number = '2h', who: Person = w.contributor, extra = {}) => {
  const res = await log(key, { records: [{ work_date: '2026-09-21', duration }], ...extra }, who);
  if (res.statusCode !== 201) throw new Error(`log failed: ${res.body}`);
  return (res.json().data as Item[])[0]!;
};
const issue = async (key: string) => (await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data;
const spent = async (key: string) => (await issue(key)).spent_minutes as number;
const items = async (key: string, query = '', who: Person = w.admin) =>
  (await w.call(who, 'GET', `/v1/issues/${key}/work-items${query}`)).json().data as Item[];
const timeLogged = async (key: string) =>
  (await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?kind=time_logged&limit=200`)).json().data as {
    change_group_id: string;
    old_value: unknown;
    new_value: unknown;
  }[];
const setTracking = (enabled: boolean, who: Person = w.admin) =>
  w.call(who, 'PATCH', `/v1/projects/${KEY}`, { time_tracking_enabled: enabled });

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

describe('POST /v1/issues/:key/work-items', () => {
  test('logs own time with the default work type, rolls it up and records time_logged', async () => {
    const key = await newIssue();
    const before = await issue(key);
    const res = await log(key, {
      records: [{ work_date: '2026-09-21', duration: '1h 30m' }],
      description_md: 'Traced it',
    });
    expect(res.statusCode).toBe(201);
    const [item] = res.json().data as Item[];
    expect(item).toMatchObject({
      issue: key,
      author: { username: w.contributor.username },
      created_by: { username: w.contributor.username },
      work_date: '2026-09-21',
      duration_minutes: 90,
      work_type: { name: 'Development', short_label: 'D' },
      description_md: 'Traced it',
      me: { can_edit: true, can_delete: true },
    });

    const after = await issue(key);
    expect(after.spent_minutes).toBe(90);
    expect(after.updated_at > before.updated_at).toBe(true);
    expect(after.updated_by.username).toBe(w.admin.username);
    expect((await timeLogged(key))[0]).toMatchObject({
      old_value: null,
      new_value: {
        work_item_id: item!.id,
        author: w.contributor.username,
        work_date: '2026-09-21',
        minutes: 90,
        work_type: 'Development',
      },
    });
  });

  test('durations follow the organisation calendar; minutes are accepted; nonsense is refused by field', async () => {
    const key = await newIssue();
    expect((await logOne(key, '1d')).duration_minutes).toBe(480);
    expect((await logOne(key, 45)).duration_minutes).toBe(45);
    const bad = await log(key, {
      records: [
        { work_date: '2026-09-21', duration: '2h' },
        { work_date: '2026-09-22', duration: 'soon' },
      ],
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatchObject({ code: 'work_item.invalid_duration', field: 'records.1.duration' });
    expect((await log(key, { records: [{ work_date: '2026-09-21', duration: '0m' }] })).json().error.code).toBe(
      'work_item.invalid_duration',
    );
    expect(await spent(key)).toBe(525);
  });

  test('a range writes one independent row per working day, skipping the weekend', async () => {
    const key = await newIssue();
    const res = await log(key, {
      records: [
        { from: '2026-09-18', to: '2026-09-22', duration: '2h' },
        { work_date: '2026-09-26', duration: '30m' },
      ],
      work_type: 'testing',
    });
    expect(res.statusCode).toBe(201);
    const rows = res.json().data as Item[];
    expect(rows.map(r => [r.work_date, r.duration_minutes])).toEqual([
      ['2026-09-18', 120],
      ['2026-09-21', 120],
      ['2026-09-22', 120],
      ['2026-09-26', 30],
    ]);
    expect(rows.every(r => r.work_type?.name === 'Testing')).toBe(true);
    expect(await spent(key)).toBe(390);
    const history = await timeLogged(key);
    expect(history).toHaveLength(4);
    expect(new Set(history.map(h => h.change_group_id)).size).toBe(1);

    const tuesday = rows[2]!;
    await w.call(w.contributor, 'DELETE', `/v1/issues/${key}/work-items/${tuesday.id}`);
    expect((await items(key)).map(r => r.work_date)).toEqual(['2026-09-18', '2026-09-21', '2026-09-26']);
  });

  test('a range must run forwards, stay within 62 days and contain a working day', async () => {
    const key = await newIssue();
    const range = (from: string, to: string) => log(key, { records: [{ from, to, duration: '1h' }] });
    expect((await range('2026-09-22', '2026-09-18')).json().error).toMatchObject({
      code: 'work_item.range_out_of_order',
      field: 'records.0.from',
    });
    expect((await range('2026-09-01', '2026-11-30')).json().error.code).toBe('work_item.range_too_long');
    expect((await range('2026-09-19', '2026-09-20')).json().error.code).toBe('work_item.range_no_working_days');
    expect(await items(key)).toEqual([]);
  });

  test('work types are matched by name; null logs none; an unknown or archived one is refused', async () => {
    const key = await newIssue();
    expect((await logOne(key, '1h', w.contributor, { work_type: null })).work_type).toBeNull();
    const unknown = await log(key, { records: [{ work_date: '2026-09-21', duration: '1h' }], work_type: 'Lunch' });
    expect(unknown.json().error).toMatchObject({ code: 'work_item.unknown_work_type', field: 'work_type' });
    expect(unknown.json().error.valid_values).toContain('Development');

    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/work-types/Observation`, { is_archived: true });
    const archived = await log(key, {
      records: [{ work_date: '2026-09-21', duration: '1h' }],
      work_type: 'Observation',
    });
    expect(archived.json().error.code).toBe('work_item.unknown_work_type');
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/work-types/Observation`, { is_archived: false });
  });

  test('the note is markdown up to 16 KB, and its mentions are stored per record', async () => {
    const key = await newIssue();
    const tooBig = await log(key, {
      records: [{ work_date: '2026-09-21', duration: '1h' }],
      description_md: 'x'.repeat(WORK_ITEM_NOTE_MAX_BYTES + 1),
    });
    expect(tooBig.json().error).toMatchObject({ code: 'work_item.note_too_large', field: 'description_md' });

    const item = await logOne(key, '1h', w.contributor, { description_md: `Paired with @${w.observer.username}` });
    const mentioned = () => w.repos.issues.listMentionedUserIds(w.repos.ctx, { type: 'work_item', id: item.id });
    expect(await mentioned()).toHaveLength(1);
    await w.call(w.contributor, 'PATCH', `/v1/issues/${key}/work-items/${item.id}`, { description_md: 'Alone' });
    expect(await mentioned()).toEqual([]);
  });
});

describe('who may log, edit and delete', () => {
  test('an observer reads but cannot log; a stranger sees nothing', async () => {
    const key = await newIssue();
    await logOne(key);
    expect((await log(key, { records: [{ work_date: '2026-09-21', duration: '1h' }] }, w.observer)).statusCode).toBe(
      403,
    );
    const seen = await items(key, '', w.observer);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.me).toEqual({ can_edit: false, can_delete: false });
    expect((await w.call(w.outsider, 'GET', `/v1/issues/${key}/work-items`)).statusCode).toBe(404);
    expect((await log(key, { records: [{ work_date: '2026-09-21', duration: '1h' }] }, w.outsider)).statusCode).toBe(
      404,
    );
  });

  test('a contributor logs only their own time; naming anyone else is refused', async () => {
    const key = await newIssue();
    const self = await logOne(key, '1h', w.contributor, { author: `@${w.contributor.username}` });
    expect(self.author.username).toBe(w.contributor.username);
    const other = await log(key, { author: w.admin.username, records: [{ work_date: '2026-09-21', duration: '1h' }] });
    expect(other.statusCode).toBe(403);
  });

  for (const role of ['admin', 'projectAdmin'] as const) {
    test(`${role === 'admin' ? 'the owner' : 'a Project Admin'} logs on a contributor's behalf and edits anyone's`, async () => {
      const who: Member = w[role];
      const key = await newIssue();
      const item = await logOne(key, '3h', who, { author: w.contributor.username });
      expect(item.author.username).toBe(w.contributor.username);
      expect(item.created_by.username).toBe(who.username);
      expect((await items(key, '', w.contributor))[0]!.me).toEqual({ can_edit: true, can_delete: true });

      const edited = await w.call(who, 'PATCH', `/v1/issues/${key}/work-items/${item.id}`, { duration: '4h' });
      expect(edited.json().data.duration_minutes).toBe(240);
      const moved = await w.call(who, 'PATCH', `/v1/issues/${key}/work-items/${item.id}`, { author: who.username });
      expect(moved.json().data.author.username).toBe(who.username);
      expect((await w.call(who, 'DELETE', `/v1/issues/${key}/work-items/${item.id}`)).statusCode).toBe(200);
    });
  }

  test('the author must be someone who could log time here', async () => {
    const key = await newIssue();
    const as = (author: string) =>
      log(key, { author, records: [{ work_date: '2026-09-21', duration: '1h' }] }, w.admin);
    expect((await as(w.observer.username)).json().error).toMatchObject({
      code: 'work_item.unknown_author',
      field: 'author',
    });
    expect((await as('@nobody-at-all')).json().error.code).toBe('work_item.unknown_author');
    const authors = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/work-authors`)).json().data as {
      username: string;
    }[];
    const names = authors.map(a => a.username);
    expect(names).toEqual(expect.arrayContaining([w.admin.username, w.projectAdmin.username, w.contributor.username]));
    expect(names).not.toContain(w.observer.username);
  });

  test("a contributor edits and deletes their own records but not someone else's", async () => {
    const key = await newIssue();
    const mine = await logOne(key, '1h');
    const theirs = await logOne(key, '1h', w.admin);
    expect((await items(key, '', w.contributor)).map(i => i.me.can_edit)).toEqual([true, false]);
    const url = (id: number) => `/v1/issues/${key}/work-items/${id}`;
    expect((await w.call(w.contributor, 'PATCH', url(theirs.id), { duration: '2h' })).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'DELETE', url(theirs.id))).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'PATCH', url(mine.id), { author: w.admin.username })).statusCode).toBe(403);
    expect((await w.call(w.observer, 'PATCH', url(mine.id), { duration: '2h' })).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'PATCH', url(mine.id), { duration: '2h' })).json().data.duration_minutes).toBe(
      120,
    );
    expect((await w.call(w.contributor, 'DELETE', url(mine.id))).statusCode).toBe(200);
    expect((await w.call(w.contributor, 'GET', url(mine.id))).statusCode).toBe(404);
  });

  test('a token needs time:write to log, and issues:read to read', async () => {
    const key = await newIssue();
    await logOne(key);
    const reader = await token(w.contributor, ['issues:read']);
    const writer = await token(w.contributor, ['issues:read', 'time:write']);
    expect((await w.call(reader, 'GET', `/v1/issues/${key}/work-items`)).statusCode).toBe(200);
    const refused = await log(key, { records: [{ work_date: '2026-09-21', duration: '1h' }] }, reader);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'time:write' });
    expect((await log(key, { records: [{ work_date: '2026-09-21', duration: '1h' }] }, writer)).statusCode).toBe(201);
    const unread = await w.call(await token(w.contributor, ['time:write']), 'GET', `/v1/issues/${key}/work-items`);
    expect(unread.statusCode).toBe(403);
    expect(unread.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'issues:read' });
  });
});

describe('PATCH and DELETE /v1/issues/:key/work-items/:id', () => {
  test('an edit records old and new; a delete records old; the rollup follows both', async () => {
    const key = await newIssue();
    const item = await logOne(key, '2h');
    const url = `/v1/issues/${key}/work-items/${item.id}`;
    const edited = await w.call(w.contributor, 'PATCH', url, {
      duration: '3h',
      work_type: 'Testing',
      work_date: '2026-09-22',
    });
    expect(edited.json().data).toMatchObject({
      duration_minutes: 180,
      work_type: { name: 'Testing' },
      work_date: '2026-09-22',
    });
    expect(await spent(key)).toBe(180);
    const [, change] = await timeLogged(key);
    expect(change).toMatchObject({
      old_value: { minutes: 120, work_type: 'Development', work_date: '2026-09-21' },
      new_value: { minutes: 180, work_type: 'Testing', work_date: '2026-09-22' },
    });

    const unchanged = await w.call(w.contributor, 'PATCH', url, { duration: 180 });
    expect(unchanged.statusCode).toBe(200);
    expect(await timeLogged(key)).toHaveLength(2);

    const removed = await w.call(w.contributor, 'DELETE', url);
    expect(removed.json().data.id).toBe(item.id);
    expect(await spent(key)).toBe(0);
    expect((await timeLogged(key))[2]).toMatchObject({ old_value: { minutes: 180 }, new_value: null });
  });

  test('a record is found only on its own issue', async () => {
    const [a, b] = [await newIssue(), await newIssue()];
    const item = await logOne(a);
    expect((await w.call(w.contributor, 'GET', `/v1/issues/${b}/work-items/${item.id}`)).json().error.code).toBe(
      'work_item.not_found',
    );
  });
});

describe('the rollup up the hierarchy', () => {
  test('subtask time reaches every ancestor, and moves with a reparent, a delete and a restore', async () => {
    const epic = await newIssue();
    const task = await newIssue({ parent: epic });
    const sub = await newIssue({ parent: task });
    const other = await newIssue();
    await logOne(epic, '1h');
    await logOne(task, '2h');
    await logOne(sub, '4h');
    expect([await spent(epic), await spent(task), await spent(sub)]).toEqual([420, 360, 240]);

    await w.call(w.contributor, 'PATCH', `/v1/issues/${task}`, { parent: other });
    expect([await spent(epic), await spent(other)]).toEqual([60, 360]);

    await w.call(w.contributor, 'POST', `/v1/issues/${epic}/links`, { link: 'parent for', issues: [task] });
    expect([await spent(epic), await spent(other)]).toEqual([420, 0]);

    await w.call(w.admin, 'DELETE', `/v1/issues/${sub}`);
    expect([await spent(epic), await spent(task)]).toEqual([180, 120]);
    await w.call(w.admin, 'POST', `/v1/issues/${sub}/restore`);
    expect([await spent(epic), await spent(task)]).toEqual([420, 360]);

    const subtree = await items(epic, '?include=subtasks');
    expect(subtree.map(i => i.issue).sort()).toEqual([epic, sub, task].sort());
    expect((await items(epic)).map(i => i.issue)).toEqual([epic]);
    expect(await spent(`${KEY}-${Number(epic.split('-')[1])}`)).toBe(420);
  });

  test('a new issue created as the parent of a timed issue starts with its time', async () => {
    const child = await newIssue();
    await logOne(child, '2h');
    const parent = await newIssue({ links: [{ link: 'parent for', issues: [child] }] });
    expect(await spent(parent)).toBe(120);
  });

  test('the list pages by cursor in date order', async () => {
    const key = await newIssue();
    await log(key, { records: [{ from: '2026-09-14', to: '2026-09-18', duration: '1h' }] });
    const first = await w.call(w.admin, 'GET', `/v1/issues/${key}/work-items?limit=3`);
    const { pagination } = first.json().meta;
    expect(pagination).toMatchObject({ total: 5, has_more: true });
    const rest = await w.call(w.admin, 'GET', `/v1/issues/${key}/work-items?limit=3&cursor=${pagination.next_cursor}`);
    expect([...first.json().data, ...rest.json().data].map((i: Item) => i.work_date)).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
    ]);
  });
});

describe('time tracking on and off', () => {
  test('only a Project Admin flips the switch; while off nothing is written, everything stays readable', async () => {
    const key = await newIssue();
    const item = await logOne(key, '2h');
    expect((await setTracking(false, w.contributor)).statusCode).toBe(403);
    const off = await setTracking(false, w.projectAdmin);
    expect(off.json().data.time_tracking_enabled).toBe(false);

    const refused = await log(key, { records: [{ work_date: '2026-09-21', duration: '1h' }] });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('time_tracking.disabled');
    const url = `/v1/issues/${key}/work-items/${item.id}`;
    expect((await w.call(w.contributor, 'PATCH', url, { duration: '1h' })).json().error.code).toBe(
      'time_tracking.disabled',
    );
    expect((await w.call(w.contributor, 'DELETE', url)).json().error.code).toBe('time_tracking.disabled');
    const listed = await items(key, '', w.contributor);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.me).toEqual({ can_edit: false, can_delete: false });
    expect(await spent(key)).toBe(120);

    expect((await setTracking(true)).json().data.time_tracking_enabled).toBe(true);
    expect((await log(key, { records: [{ work_date: '2026-09-21', duration: '1h' }] })).statusCode).toBe(201);
  });

  test('an archived project takes no time and keeps its switch as it is', async () => {
    const key = await newIssue();
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/archive`);
    try {
      expect((await log(key, { records: [{ work_date: '2026-09-21', duration: '1h' }] })).json().error.code).toBe(
        'project.archived',
      );
      expect((await setTracking(false)).json().error.code).toBe('project.archived');
    } finally {
      await w.call(w.admin, 'POST', `/v1/projects/${KEY}/unarchive`);
    }
  });
});
