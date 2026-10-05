import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { MARKDOWN_HARD_LIMIT_BYTES, MARKDOWN_SOFT_LIMIT_BYTES } from '@nothingleft/types';
import { issueWorld, type IssueWorld } from './issue-world.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'ISS';

const create = (body: object = {}) =>
  w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Login redirect loops', ...body });
const activityOf = async (key: string) =>
  (await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?limit=200`)).json().data as {
    kind: string;
    field: string | null;
    old_value: unknown;
    new_value: unknown;
    change_group_id: string;
  }[];

beforeAll(async () => {
  w = await issueWorld(KEY);
});

afterAll(async () => {
  await w.close();
});

describe('POST /v1/issues', () => {
  test('numbers issues per project from 1 and fills the seeded defaults', async () => {
    const first = await create();
    expect(first.statusCode).toBe(201);
    expect(first.json().data).toMatchObject({
      key: `${KEY}-1`,
      project: { key: KEY, name: 'Acme Web' },
      status: { name: 'Open', category: 'unstarted' },
      priority: { name: 'Normal' },
      type: { name: 'Bug' },
      assignees: [],
      created_by: { username: w.admin.username },
      updated_by: { username: w.admin.username },
      estimate_minutes: null,
      spent_minutes: 0,
      resolved_at: null,
      watcher_count: 1,
      me: { starred: false, voted: false, watching: true },
      deleted_at: null,
    });
    expect((await create()).json().data.key).toBe(`${KEY}-2`);
    expect((await activityOf(`${KEY}-1`)).map(a => a.kind)).toEqual(['created']);
  });

  test('names resolve case-insensitively; durations read with the organisation calendar', async () => {
    const res = await create({
      status: 'in progress',
      priority: 'MAJOR',
      type: 'feature',
      assignees: [`@${w.contributor.username}`],
      estimate: '1d 2h',
      start_date: '2026-09-19',
      due_date: '2026-09-26',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      status: { name: 'In Progress' },
      priority: { name: 'Major' },
      type: { name: 'Feature' },
      assignees: [{ username: w.contributor.username }],
      estimate_minutes: 600,
      start_date: '2026-09-19',
      due_date: '2026-09-26',
      watcher_count: 2,
    });
    expect((await create({ estimate: 90 })).json().data.estimate_minutes).toBe(90);
  });

  test('a resolved status stamps resolved_at at creation', async () => {
    expect((await create({ status: 'Fixed' })).json().data.resolved_at).not.toBeNull();
  });

  test('rejections are instructive', async () => {
    const status = await create({ status: 'Done' });
    expect(status.statusCode).toBe(400);
    expect(status.json().error).toMatchObject({ code: 'issue.unknown_status', field: 'status' });
    expect(status.json().error.valid_values).toContain('In Progress');
    expect(status.json().error.message).toBe(`Unknown status "Done" for project ${KEY}.`);

    expect((await create({ estimate: 'soon' })).json().error.code).toBe('issue.invalid_duration');
    expect((await create({ start_date: '2026-10-01', due_date: '2026-09-01' })).json().error.code).toBe(
      'issue.dates_out_of_order',
    );
    expect((await create({ assignees: [`@${w.outsider.username || 'nobody-here'}`] })).json().error.code).toBe(
      'issue.unknown_assignee',
    );
    expect((await create({ title: '' })).json().error.code).toBe('validation_failed');
    expect((await create({ title: 'x'.repeat(501) })).json().error.code).toBe('validation_failed');
  });

  test('256KB is the description limit; 64KB is only a warning the client shows', async () => {
    expect((await create({ description_md: 'a'.repeat(MARKDOWN_SOFT_LIMIT_BYTES + 10) })).statusCode).toBe(201);
    const tooBig = await create({ description_md: 'a'.repeat(MARKDOWN_HARD_LIMIT_BYTES + 1) });
    expect(tooBig.statusCode).toBe(400);
    expect(tooBig.json().error).toMatchObject({ code: 'issue.description_too_large', field: 'description_md' });
  });

  test('description mentions are stored for members and unknown names are dropped', async () => {
    const res = await create({
      description_md: `Ping @${w.contributor.username} and @nobody-at-all, not \`@${w.observer.username}\`. See ${KEY}-1.`,
    });
    const n = Number(res.json().data.key.split('-')[1]);
    const id = await w.repos.issueId(n);
    const mentioned = await w.repos.issues.listMentionedUserIds(w.repos.ctx, { type: 'issue', id });
    expect(mentioned).toHaveLength(1);

    await w.call(w.admin, 'PATCH', `/v1/issues/${KEY}-${n}`, { description_md: null });
    expect(await w.repos.issues.listMentionedUserIds(w.repos.ctx, { type: 'issue', id })).toEqual([]);
  });
});

describe('GET /v1/issues/:key', () => {
  test('one path segment, case-insensitive; anything unreadable is a 404', async () => {
    expect((await w.call(w.observer, 'GET', `/v1/issues/${KEY}-1`)).statusCode).toBe(200);
    expect((await w.call(w.admin, 'GET', `/v1/issues/${KEY.toLowerCase()}-1`)).json().data.key).toBe(`${KEY}-1`);
    for (const url of [`/v1/issues/${KEY}-9999`, '/v1/issues/NOPE-1', '/v1/issues/garbage']) {
      const res = await w.call(w.admin, 'GET', url);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('issue.not_found');
    }
    const stranger = await w.call(w.outsider, 'GET', `/v1/issues/${KEY}-1`, undefined, { 'x-organization': w.slug });
    expect(stranger.statusCode).toBe(404);
  });

  test('lists page by offset, newest first', async () => {
    const res = await w.call(w.observer, 'GET', `/v1/issues?project=${KEY}&limit=2`);
    expect(res.statusCode).toBe(200);
    const { data, meta } = res.json();
    expect(data).toHaveLength(2);
    expect(Number(data[0].key.split('-')[1])).toBeGreaterThan(Number(data[1].key.split('-')[1]));
    expect(meta.pagination).toMatchObject({ limit: 2, offset: 0, has_more: true, next_cursor: null });
  });
});

describe('PATCH /v1/issues/:key', () => {
  test('an absent key leaves a field alone; null clears it', async () => {
    const key = (await create({ due_date: '2026-09-26', estimate: '4h' })).json().data.key;
    const renamed = await w.call(w.contributor, 'PATCH', `/v1/issues/${key}`, { title: 'Renamed' });
    expect(renamed.json().data).toMatchObject({
      title: 'Renamed',
      due_date: '2026-09-26',
      estimate_minutes: 240,
      updated_by: { username: w.contributor.username },
    });
    const cleared = await w.call(w.contributor, 'PATCH', `/v1/issues/${key}`, { due_date: null, estimate: null });
    expect(cleared.json().data).toMatchObject({ title: 'Renamed', due_date: null, estimate_minutes: null });
  });

  test('resolved_at follows the status category, and survives a move between resolved statuses', async () => {
    const key = (await create()).json().data.key;
    const fixed = (await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { status: 'Fixed' })).json().data;
    expect(fixed.resolved_at).not.toBeNull();
    const closed = (await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { status: 'Closed' })).json().data;
    expect(closed.resolved_at).toBe(fixed.resolved_at);
    const reopened = (await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { status: 'Reopened' })).json().data;
    expect(reopened.resolved_at).toBeNull();
  });

  test('one save is one change group; a no-op save writes nothing', async () => {
    const key = (await create()).json().data.key;
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Major', type: 'Task', estimate: '2h' });
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Major' });
    const changes = (await activityOf(key)).filter(a => a.kind === 'field_changed');
    expect(changes.map(c => c.field).sort()).toEqual(['estimate', 'priority', 'type']);
    expect(new Set(changes.map(c => c.change_group_id)).size).toBe(1);
    expect(changes.find(c => c.field === 'priority')).toMatchObject({
      old_value: { name: 'Normal' },
      new_value: { name: 'Major' },
    });
  });

  test('A → B → C coalesces into one row; A → B → A leaves no trace', async () => {
    const key = (await create()).json().data.key;
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Major' });
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Critical' });
    expect((await activityOf(key)).filter(a => a.field === 'priority')).toEqual([
      expect.objectContaining({ old_value: { name: 'Normal' }, new_value: { name: 'Critical' } }),
    ]);
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Normal' });
    expect((await activityOf(key)).filter(a => a.field === 'priority')).toEqual([]);
  });

  test("another actor's change to the field is a hard stop", async () => {
    const key = (await create()).json().data.key;
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Major' });
    await w.call(w.contributor, 'PATCH', `/v1/issues/${key}`, { priority: 'Minor' });
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Critical' });
    expect((await activityOf(key)).filter(a => a.field === 'priority')).toHaveLength(3);
  });

  test('assignees are a set; newly assigned people start watching', async () => {
    const key = (await create()).json().data.key;
    const res = await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, {
      assignees: [w.contributor.username, `@${w.contributor.username}`],
    });
    expect(res.json().data.assignees.map((a: { username: string }) => a.username)).toEqual([w.contributor.username]);
    const watchers = (await w.call(w.contributor, 'GET', `/v1/issues/${key}/watchers`)).json().data;
    expect(watchers.map((x: { username: string; source: string }) => [x.username, x.source]).sort()).toEqual(
      [
        [w.admin.username, 'auto'],
        [w.contributor.username, 'auto'],
      ].sort(),
    );
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { assignees: [] });
    expect((await activityOf(key)).filter(a => a.field === 'assignees')).toEqual([]);
    expect((await w.call(w.contributor, 'GET', `/v1/issues/${key}/watchers`)).json().data).toHaveLength(2);
  });

  test('an archived status cannot be newly chosen', async () => {
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/statuses/Obsolete`, { is_archived: true });
    const res = await create({ status: 'Obsolete' });
    expect(res.json().error.code).toBe('issue.unknown_status');
    expect(res.json().error.valid_values).not.toContain('Obsolete');
    await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/statuses/Obsolete`, { is_archived: false });
  });
});

describe('GET /v1/projects/:key/assignees', () => {
  test('lists everyone who can be assigned, readable by an observer; strangers get a 404', async () => {
    const res = await w.call(w.observer, 'GET', `/v1/projects/${KEY}/assignees`);
    expect(res.statusCode).toBe(200);
    expect(
      res
        .json()
        .data.map((m: { username: string }) => m.username)
        .sort(),
    ).toEqual([w.admin.username, w.projectAdmin.username, w.contributor.username, w.observer.username].sort());
    expect(Object.keys(res.json().data[0]).sort()).toEqual([
      'avatar_url',
      'deactivated',
      'former_member',
      'name',
      'username',
    ]);
    const stranger = await w.call(w.outsider, 'GET', `/v1/projects/${KEY}/assignees`, undefined, {
      'x-organization': w.slug,
    });
    expect(stranger.statusCode).toBe(404);
  });
});

describe('permissions', () => {
  test('an observer reads and signals but changes nothing', async () => {
    const key = (await create()).json().data.key;
    expect((await w.call(w.observer, 'POST', '/v1/issues', { project: KEY, title: 'No' })).statusCode).toBe(403);
    expect((await w.call(w.observer, 'PATCH', `/v1/issues/${key}`, { title: 'No' })).statusCode).toBe(403);
    expect((await w.call(w.observer, 'PATCH', `/v1/issues/${key}`, { status: 'Open' })).statusCode).toBe(403);
    expect((await w.call(w.observer, 'PATCH', `/v1/issues/${key}`, { assignees: [] })).statusCode).toBe(403);
    expect((await w.call(w.observer, 'DELETE', `/v1/issues/${key}`)).statusCode).toBe(403);
    expect((await w.call(w.observer, 'PUT', `/v1/issues/${key}/star`)).statusCode).toBe(200);
    expect((await w.call(w.observer, 'PUT', `/v1/issues/${key}/vote`)).statusCode).toBe(200);
    expect((await w.call(w.observer, 'GET', `/v1/issues/${key}/voters`)).statusCode).toBe(200);
    const others = await w.call(w.observer, 'POST', `/v1/issues/${key}/watchers`, { username: w.contributor.username });
    expect(others.statusCode).toBe(403);
  });

  test('a contributor creates, edits, assigns and changes status, but does not delete', async () => {
    const res = await w.call(w.contributor, 'POST', '/v1/issues', { project: KEY, title: 'Mine' });
    expect(res.statusCode).toBe(201);
    const key = res.json().data.key;
    expect(
      (await w.call(w.contributor, 'PATCH', `/v1/issues/${key}`, { status: 'Open', assignees: [w.observer.username] }))
        .statusCode,
    ).toBe(200);
    expect((await w.call(w.contributor, 'DELETE', `/v1/issues/${key}`)).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'GET', `/v1/issues?project=${KEY}&deleted=true`)).statusCode).toBe(403);
  });
});

describe('soft delete and restore', () => {
  test('a deleted issue disappears, is listed for restore, and comes back', async () => {
    const key = (await create()).json().data.key;
    const deleted = await w.call(w.admin, 'DELETE', `/v1/issues/${key}`);
    expect(deleted.statusCode).toBe(200);
    const body = deleted.json().data;
    expect(body.deleted_at).not.toBeNull();
    expect(Date.parse(body.restorable_until) - Date.parse(body.deleted_at)).toBe(14 * 86_400_000);

    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}`)).statusCode).toBe(404);
    expect((await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { title: 'x' })).statusCode).toBe(404);
    const live = (await w.call(w.admin, 'GET', `/v1/issues?project=${KEY}&limit=200`)).json().data;
    expect(live.map((i: { key: string }) => i.key)).not.toContain(key);
    const trash = (await w.call(w.admin, 'GET', `/v1/issues?project=${KEY}&deleted=true`)).json().data;
    expect(trash.map((i: { key: string }) => i.key)).toContain(key);

    expect((await w.call(w.contributor, 'POST', `/v1/issues/${key}/restore`)).statusCode).toBe(404);
    const restored = await w.call(w.admin, 'POST', `/v1/issues/${key}/restore`);
    expect(restored.json().data.deleted_at).toBeNull();
    expect((await activityOf(key)).map(a => a.kind)).toEqual(['created', 'deleted', 'restored']);
  });

  test('past the window, restore answers 404', async () => {
    const key = (await create()).json().data.key;
    await w.call(w.admin, 'DELETE', `/v1/issues/${key}`);
    const id = await w.repos.issueId(Number(key.split('-')[1]));
    await w.repos.issues.update(w.repos.ctx, id, { deleted_at: new Date(Date.now() - 15 * 86_400_000) });
    expect((await w.call(w.admin, 'POST', `/v1/issues/${key}/restore`)).statusCode).toBe(404);
  });
});

describe('stars, votes and watchers', () => {
  test('a star implies a watch; unstarring keeps the watch', async () => {
    const key = (await create()).json().data.key;
    const starred = (await w.call(w.observer, 'PUT', `/v1/issues/${key}/star`)).json().data;
    expect(starred.me).toEqual({ starred: true, voted: false, watching: true });
    const unstarred = (await w.call(w.observer, 'DELETE', `/v1/issues/${key}/star`)).json().data;
    expect(unstarred.me).toEqual({ starred: false, voted: false, watching: true });
    const unwatched = (await w.call(w.observer, 'DELETE', `/v1/issues/${key}/watch`)).json().data;
    expect(unwatched.me.watching).toBe(false);
  });

  test('votes count once per person', async () => {
    const key = (await create()).json().data.key;
    await w.call(w.observer, 'PUT', `/v1/issues/${key}/vote`);
    await w.call(w.observer, 'PUT', `/v1/issues/${key}/vote`);
    const voted = (await w.call(w.contributor, 'PUT', `/v1/issues/${key}/vote`)).json().data;
    expect(voted.vote_count).toBe(2);
    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}/voters`)).json().data).toHaveLength(2);
    expect((await w.call(w.observer, 'DELETE', `/v1/issues/${key}/vote`)).json().data.vote_count).toBe(1);
  });

  test('contributors add and remove other watchers; only project people can watch', async () => {
    const key = (await create()).json().data.key;
    const added = await w.call(w.contributor, 'POST', `/v1/issues/${key}/watchers`, { username: w.observer.username });
    expect(added.statusCode).toBe(201);
    expect(added.json().data).toMatchObject({ username: w.observer.username, source: 'explicit' });
    const self = await w.call(w.observer, 'DELETE', `/v1/issues/${key}/watchers/${w.observer.username}`);
    expect(self.statusCode).toBe(200);
    expect(
      (await w.call(w.observer, 'DELETE', `/v1/issues/${key}/watchers/${w.observer.username}`)).json().error.code,
    ).toBe('issue.not_watching');
    const stranger = await w.call(w.admin, 'POST', `/v1/issues/${key}/watchers`, { username: 'nobody-at-all' });
    expect(stranger.json().error.code).toBe('issue.watcher_not_in_project');
  });
});

describe('activity paging', () => {
  test('is cursor-paged oldest first', async () => {
    const key = (await create()).json().data.key;
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { title: 'One' });
    await w.call(w.contributor, 'PATCH', `/v1/issues/${key}`, { title: 'Two' });
    const first = (await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?limit=2`)).json();
    expect(first.data.map((a: { kind: string }) => a.kind)).toEqual(['created', 'field_changed']);
    expect(first.meta.pagination).toMatchObject({ total: 3, has_more: true });
    const next = (
      await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?limit=2&cursor=${first.meta.pagination.next_cursor}`)
    ).json();
    expect(next.data).toHaveLength(1);
    expect(next.data[0].actor.username).toBe(w.contributor.username);
    expect(next.meta.pagination).toMatchObject({ has_more: false, next_cursor: null });
    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?cursor=nope`)).json().error.code).toBe(
      'activity.invalid_cursor',
    );
  });
});

describe('Idempotency-Key', () => {
  test('a retried create replays the first response instead of filing twice', async () => {
    const headers = { 'idempotency-key': `k-${Date.now()}` };
    const body = { project: KEY, title: 'Filed once' };
    const first = await w.call(w.admin, 'POST', '/v1/issues', body, headers);
    const again = await w.call(w.admin, 'POST', '/v1/issues', body, headers);
    expect(again.statusCode).toBe(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.json().data.key).toBe(first.json().data.key);

    const reused = await w.call(w.admin, 'POST', '/v1/issues', { ...body, title: 'Different' }, headers);
    expect(reused.statusCode).toBe(422);
    expect(reused.json().error.code).toBe('idempotency.key_reused');

    const otherCaller = await w.call(w.contributor, 'POST', '/v1/issues', body, headers);
    expect(otherCaller.json().data.key).not.toBe(first.json().data.key);
  });
});

describe('the project around its issues', () => {
  test('the key freezes once the first issue exists', async () => {
    const project = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}`)).json().data;
    expect(project.key_editable).toBe(false);
    const res = await w.call(w.admin, 'PATCH', `/v1/projects/${KEY}`, { key: 'NEWKEY' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('project.key_locked');
  });

  test('an archived project is read-only except for personal signals', async () => {
    const key = (await create()).json().data.key;
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/archive`);
    try {
      expect((await create()).json().error.code).toBe('project.archived');
      expect((await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { title: 'x' })).statusCode).toBe(409);
      expect((await w.call(w.admin, 'PUT', `/v1/issues/${key}/star`)).statusCode).toBe(200);
      expect((await w.call(w.admin, 'GET', `/v1/issues/${key}`)).statusCode).toBe(200);
    } finally {
      await w.call(w.admin, 'POST', `/v1/projects/${KEY}/unarchive`);
    }
  });
});
