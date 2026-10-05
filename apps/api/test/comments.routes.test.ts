import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { MARKDOWN_HARD_LIMIT_BYTES } from '@nothingleft/types';
import { issueWorld, type IssueWorld } from './issue-world.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'COM';

const newIssue = async () =>
  (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Checkout times out' })).json().data
    .key as string;
const comment = (key: string, body_md: string, who = w.contributor) =>
  w.call(who, 'POST', `/v1/issues/${key}/comments`, { body_md });
const activityOf = async (key: string, query = '') =>
  (await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?limit=200${query}`)).json().data as {
    kind: string;
    field: string | null;
    new_value: unknown;
    comment: { id: number; body_md: string } | null;
  }[];

beforeAll(async () => {
  w = await issueWorld(KEY);
});

afterAll(async () => {
  await w.close();
});

describe('POST /v1/issues/:key/comments', () => {
  test('creates the comment, counts it, watches the author and records commented', async () => {
    const key = await newIssue();
    const before = (await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data;
    const res = await comment(key, 'Reproduced on **staging**.');
    expect(res.statusCode).toBe(201);
    const created = res.json().data;
    expect(created).toMatchObject({
      issue: key,
      author: { username: w.contributor.username, former_member: false },
      body_md: 'Reproduced on **staging**.',
      edited_at: null,
      deleted_at: null,
      me: { can_edit: true, can_delete: true },
    });

    const after = (await w.call(w.contributor, 'GET', `/v1/issues/${key}`)).json().data;
    expect(after.comment_count).toBe(1);
    expect(after.me.watching).toBe(true);
    expect(after.updated_at > before.updated_at).toBe(true);
    expect(after.updated_by.username).toBe(w.admin.username);

    const entry = (await activityOf(key)).find(a => a.kind === 'commented')!;
    expect(entry.new_value).toEqual({ comment_id: created.id });
    expect(entry.comment).toMatchObject({ id: created.id, body_md: 'Reproduced on **staging**.' });
  });

  test('an empty or oversized body is refused with the catalogue error', async () => {
    const key = await newIssue();
    expect((await comment(key, '   ')).json().error.code).toBe('comment.body_empty');
    const huge = await comment(key, 'x'.repeat(MARKDOWN_HARD_LIMIT_BYTES + 1));
    expect(huge.statusCode).toBe(400);
    expect(huge.json().error).toMatchObject({ code: 'comment.body_too_large', field: 'body_md' });
  });

  test('an observer may read comments but not write one; a stranger gets a 404', async () => {
    const key = await newIssue();
    await comment(key, 'First');
    expect((await comment(key, 'Me too', w.observer)).statusCode).toBe(403);
    expect((await w.call(w.observer, 'GET', `/v1/issues/${key}/comments`)).json().data).toHaveLength(1);
    expect((await w.call(w.outsider, 'GET', `/v1/issues/${key}/comments`)).statusCode).toBe(404);
    expect((await comment(key, 'Hello', w.outsider)).statusCode).toBe(404);
  });

  test('mentions resolve to live members and are replaced on edit', async () => {
    const key = await newIssue();
    const created = (await comment(key, `@${w.observer.username} and @nobody-here, please look`)).json().data;
    const mentioned = () => w.repos.issues.listMentionedUserIds(w.repos.ctx, { type: 'comment', id: created.id });
    expect(await mentioned()).toHaveLength(1);
    await w.call(w.contributor, 'PATCH', `/v1/issues/${key}/comments/${created.id}`, { body_md: 'No mention now' });
    expect(await mentioned()).toEqual([]);
  });

  test('a new comment ends the coalescing window (hard stop 1)', async () => {
    const key = await newIssue();
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Major' });
    await comment(key, 'Bumping this', w.admin);
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Critical' });
    const changes = (await activityOf(key)).filter(a => a.field === 'priority');
    expect(changes).toHaveLength(2);
  });
});

describe('GET /v1/issues/:key/comments', () => {
  test('pages oldest first by cursor, with the live total', async () => {
    const key = await newIssue();
    for (const body of ['one', 'two', 'three']) await comment(key, body);
    const first = (await w.call(w.admin, 'GET', `/v1/issues/${key}/comments?limit=2`)).json();
    expect(first.data.map((c: { body_md: string }) => c.body_md)).toEqual(['one', 'two']);
    expect(first.meta.pagination).toMatchObject({ total: 3, has_more: true });
    const next = (
      await w.call(w.admin, 'GET', `/v1/issues/${key}/comments?limit=2&cursor=${first.meta.pagination.next_cursor}`)
    ).json();
    expect(next.data.map((c: { body_md: string }) => c.body_md)).toEqual(['three']);
    expect(next.meta.pagination).toMatchObject({ has_more: false, next_cursor: null });
    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}/comments?cursor=nonsense`)).statusCode).toBe(400);
  });
});

describe('PATCH and DELETE /v1/issues/:key/comments/:id', () => {
  test('an edit sets the marker and records comment_edited; an unchanged body is not an edit', async () => {
    const key = await newIssue();
    const { id } = (await comment(key, 'Typo hre')).json().data;
    const same = await w.call(w.contributor, 'PATCH', `/v1/issues/${key}/comments/${id}`, { body_md: 'Typo hre' });
    expect(same.json().data.edited_at).toBeNull();
    const edited = await w.call(w.contributor, 'PATCH', `/v1/issues/${key}/comments/${id}`, { body_md: 'Typo here' });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data).toMatchObject({ body_md: 'Typo here' });
    expect(edited.json().data.edited_at).not.toBeNull();
    expect((await activityOf(key)).filter(a => a.kind === 'comment_edited')).toHaveLength(1);
  });

  test("a contributor edits and deletes only their own; a project admin may do either to anyone's", async () => {
    const key = await newIssue();
    const { id } = (await comment(key, 'Admin note', w.admin)).json().data;
    const seen = (await w.call(w.contributor, 'GET', `/v1/issues/${key}/comments/${id}`)).json().data;
    expect(seen.me).toEqual({ can_edit: false, can_delete: false });
    expect(
      (await w.call(w.contributor, 'PATCH', `/v1/issues/${key}/comments/${id}`, { body_md: 'Hijack' })).statusCode,
    ).toBe(403);
    expect((await w.call(w.contributor, 'DELETE', `/v1/issues/${key}/comments/${id}`)).statusCode).toBe(403);
    expect((await w.call(w.observer, 'DELETE', `/v1/issues/${key}/comments/${id}`)).statusCode).toBe(403);

    const own = (await comment(key, 'Mine')).json().data;
    expect(
      (await w.call(w.admin, 'PATCH', `/v1/issues/${key}/comments/${own.id}`, { body_md: 'Moderated' })).statusCode,
    ).toBe(200);
    expect((await w.call(w.admin, 'DELETE', `/v1/issues/${key}/comments/${own.id}`)).statusCode).toBe(200);
  });

  test('a deleted comment vanishes: out of the list, the count and the activity; only comment_deleted stays', async () => {
    const key = await newIssue();
    const { id } = (await comment(key, `Gone soon @${w.admin.username}`)).json().data;
    await w.call(w.contributor, 'PATCH', `/v1/issues/${key}/comments/${id}`, { body_md: 'Edited, then gone' });
    const res = await w.call(w.contributor, 'DELETE', `/v1/issues/${key}/comments/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted_at).not.toBeNull();

    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}/comments`)).json().data).toEqual([]);
    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data.comment_count).toBe(0);
    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}/comments/${id}`)).statusCode).toBe(404);
    expect((await w.call(w.contributor, 'DELETE', `/v1/issues/${key}/comments/${id}`)).statusCode).toBe(404);
    const kinds = (await activityOf(key)).map(a => a.kind);
    expect(kinds).toEqual(['created', 'comment_deleted']);
    expect(await w.repos.issues.listMentionedUserIds(w.repos.ctx, { type: 'comment', id })).toEqual([]);
  });

  test('a comment is addressed through its own issue only', async () => {
    const key = await newIssue();
    const other = await newIssue();
    const { id } = (await comment(key, 'Here')).json().data;
    expect((await w.call(w.admin, 'GET', `/v1/issues/${other}/comments/${id}`)).statusCode).toBe(404);
  });
});

describe('task checkboxes', () => {
  test('a comment tick is an edit under the edit rules', async () => {
    const key = await newIssue();
    const { id } = (await comment(key, '- [ ] migrate\n- [ ] deploy')).json().data;
    const url = `/v1/issues/${key}/comments/${id}/tasks/toggle`;
    const ticked = await w.call(w.contributor, 'POST', url, { index: 1, checked: true });
    expect(ticked.statusCode).toBe(200);
    expect(ticked.json().data.body_md).toBe('- [ ] migrate\n- [x] deploy');
    expect(ticked.json().data.edited_at).not.toBeNull();
    expect((await w.call(w.observer, 'POST', url, { index: 0, checked: true })).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'POST', url, { index: 5, checked: true })).json().error.code).toBe(
      'issue.no_task',
    );
  });

  test('a description tick is a description change under issue.update', async () => {
    const created = await w.call(w.admin, 'POST', '/v1/issues', {
      project: KEY,
      title: 'Release checklist',
      description_md: '1. [ ] notes\n2. [x] tag',
    });
    const key = created.json().data.key;
    const url = `/v1/issues/${key}/tasks/toggle`;
    const res = await w.call(w.contributor, 'POST', url, { index: 0, checked: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.description_md).toBe('1. [x] notes\n2. [x] tag');
    expect((await w.call(w.observer, 'POST', url, { index: 0, checked: false })).statusCode).toBe(403);
    expect((await activityOf(key)).some(a => a.field === 'description')).toBe(true);
  });
});

describe('GET /v1/issues/:key/activity?kind=', () => {
  test('filters by kind, so the History tab can leave comments out', async () => {
    const key = await newIssue();
    await comment(key, 'A comment');
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { priority: 'Minor' });
    expect((await activityOf(key, '&kind=commented')).map(a => a.kind)).toEqual(['commented']);
    expect((await activityOf(key, '&kind=created&kind=field_changed')).map(a => a.kind)).toEqual([
      'created',
      'field_changed',
    ]);
    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?kind=bogus`)).statusCode).toBe(400);
  });
});
