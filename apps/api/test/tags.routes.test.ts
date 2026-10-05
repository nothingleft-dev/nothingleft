import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { LABEL_COLORS } from '@nothingleft/types';
import { issueWorld, type IssueWorld } from './issue-world.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'TAG';

const newIssue = async (who = w.admin) =>
  (await w.call(who, 'POST', '/v1/issues', { project: KEY, title: 'Invoice totals drift' })).json().data.key as string;
const tag = (
  key: string,
  tags: (string | { name: string; color?: string })[],
  extra: object = {},
  who = w.contributor,
) => w.call(who, 'POST', `/v1/issues/${key}/tags`, { tags, ...extra });
const activityOf = async (key: string) =>
  (await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?limit=200`)).json().data as {
    kind: string;
    old_value: unknown;
    new_value: unknown;
    actor: { username: string | null; former_member: boolean };
    comment: { author: { former_member: boolean } } | null;
  }[];

beforeAll(async () => {
  w = await issueWorld(KEY);
});

afterAll(async () => {
  await w.close();
});

describe('tags', () => {
  test('apply creates on first use, keeps the name as typed and preserves colons', async () => {
    const key = await newIssue();
    const res = await tag(key, ['Needs Review', 'area:billing'], { color: 'teal-3' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.tags).toEqual([
      { name: 'area:billing', slug: 'area:billing', color: 'teal-3' },
      { name: 'Needs Review', slug: 'needs-review', color: 'teal-3' },
    ]);
    expect((await activityOf(key)).filter(a => a.kind === 'tagged').map(a => a.new_value)).toEqual([
      { name: 'area:billing' },
      { name: 'Needs Review' },
    ]);
  });

  test('a slug match reuses the existing tag and its colour; reapplying is not a change', async () => {
    const first = await newIssue();
    await tag(first, ['Customer Report'], { color: 'pink-2' });
    const second = await newIssue();
    const res = await tag(second, ['-- customer   REPORT --'], { color: 'blue-4' });
    expect(res.json().data.tags).toEqual([{ name: 'Customer Report', slug: 'customer-report', color: 'pink-2' }]);
    await tag(second, ['customer-report']);
    expect((await activityOf(second)).filter(a => a.kind === 'tagged')).toHaveLength(1);
  });

  test('a new tag without a colour gets a label colour; each new tag may carry its own', async () => {
    const key = await newIssue();
    const [created] = (await tag(key, ['auto-coloured'])).json().data.tags;
    expect(LABEL_COLORS).toContain(created.color);
    const res = await tag(key, [{ name: 'Per Tag One', color: 'green-2' }, 'per-tag-two'], { color: 'red-4' });
    const bySlug = Object.fromEntries(
      res.json().data.tags.map((t: { slug: string; color: string }) => [t.slug, t.color]),
    );
    expect(bySlug).toMatchObject({ 'per-tag-one': 'green-2', 'per-tag-two': 'red-4' });
    expect((await tag(key, ['x'], { color: 'violet' })).statusCode).toBe(400);
  });

  test('POST /v1/issues applies tags in the same transaction, each new one with its own colour', async () => {
    await tag(await newIssue(), ['Existing Tag'], { color: 'blue-1' });
    const res = await w.call(w.contributor, 'POST', '/v1/issues', {
      project: KEY,
      title: 'Tagged at birth',
      tags: ['existing-tag', { name: 'Brand New', color: 'yellow-3' }],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.tags).toEqual([
      { name: 'Brand New', slug: 'brand-new', color: 'yellow-3' },
      { name: 'Existing Tag', slug: 'existing-tag', color: 'blue-1' },
    ]);
    const kinds = (await activityOf(res.json().data.key)).map(a => a.kind);
    expect(kinds).toEqual(['created', 'tagged', 'tagged']);
    const bad = await w.call(w.contributor, 'POST', '/v1/issues', { project: KEY, title: 'x', tags: ['!!!'] });
    expect(bad.json().error).toMatchObject({ code: 'tag.invalid', field: 'tags' });
    expect((await w.call(w.observer, 'POST', '/v1/issues', { project: KEY, title: 'x', tags: ['a'] })).statusCode).toBe(
      403,
    );
  });

  test('remove by name or slug records untagged; removing an absent tag is a 404', async () => {
    const key = await newIssue();
    await tag(key, ['Flaky Test']);
    const res = await w.call(w.contributor, 'DELETE', `/v1/issues/${key}/tags/${encodeURIComponent('Flaky Test')}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.tags).toEqual([]);
    expect((await activityOf(key)).find(a => a.kind === 'untagged')?.old_value).toEqual({ name: 'Flaky Test' });
    const again = await w.call(w.contributor, 'DELETE', `/v1/issues/${key}/tags/flaky-test`);
    expect(again.statusCode).toBe(404);
    expect(again.json().error.code).toBe('issue.not_tagged');
  });

  test('a name with nothing sluggable is refused', async () => {
    const key = await newIssue();
    expect((await tag(key, ['!!!'])).json().error.code).toBe('tag.invalid');
  });

  test('observers cannot tag; the org tag list serves the pickers and matches on name or slug', async () => {
    const key = await newIssue();
    expect((await tag(key, ['nope'], {}, w.observer)).statusCode).toBe(403);
    await tag(key, ['Picker Target']);
    const list = await w.call(w.observer, 'GET', '/v1/tags?q=picker');
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([expect.objectContaining({ name: 'Picker Target', slug: 'picker-target' })]);
    expect(list.json().meta.pagination.total).toBe(1);
    expect(
      (await w.call(w.outsider, 'GET', '/v1/tags')).json().data.map((t: { slug: string }) => t.slug),
    ).not.toContain('picker-target');
  });

  test('tags are searchable with tag:', async () => {
    const key = await newIssue();
    await tag(key, ['searchable-tag']);
    const res = await w.call(w.admin, 'GET', `/v1/issues?q=${encodeURIComponent('tag: searchable-tag')}`);
    expect(res.json().data.map((i: { key: string }) => i.key)).toEqual([key]);
  });
});

// Last in the file: it removes the contributor from the organisation.
describe('former members (2.38, 2.39)', () => {
  test('render with their real name and the chip, stay searchable, and can no longer be mentioned', async () => {
    const key = await newIssue(w.contributor);
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { assignees: [w.contributor.username] });
    await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'On it' });
    const removed = await w.call(w.admin, 'DELETE', `/v1/organizations/${w.slug}/members/${w.contributor.username}`);
    expect(removed.statusCode).toBe(200);

    const issue = (await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data;
    expect(issue.created_by).toMatchObject({ username: w.contributor.username, name: 'Casey', former_member: true });
    expect(issue.updated_by.former_member).toBe(false);
    const [comment] = (await w.call(w.admin, 'GET', `/v1/issues/${key}/comments`)).json().data;
    expect(comment.author).toMatchObject({ name: 'Casey', former_member: true });
    const entries = await activityOf(key);
    expect(entries.find(a => a.kind === 'commented')?.actor.former_member).toBe(true);
    expect(entries.find(a => a.kind === 'commented')?.comment?.author.former_member).toBe(true);

    const q = encodeURIComponent(`created by: @${w.contributor.username}`);
    const found = await w.call(w.admin, 'GET', `/v1/issues?q=${q}`);
    expect(found.statusCode).toBe(200);
    expect(found.json().data.map((i: { key: string }) => i.key)).toContain(key);
    const commenter = encodeURIComponent(`commenter: @${w.contributor.username}`);
    expect(
      (await w.call(w.admin, 'GET', `/v1/issues?q=${commenter}`)).json().data.map((i: { key: string }) => i.key),
    ).toContain(key);

    const pickable = (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/assignees`)).json().data;
    expect(pickable.map((m: { username: string }) => m.username)).not.toContain(w.contributor.username);
    const mention = await w.call(w.admin, 'POST', `/v1/issues/${key}/comments`, {
      body_md: `@${w.contributor.username} thanks`,
    });
    expect(
      await w.repos.issues.listMentionedUserIds(w.repos.ctx, { type: 'comment', id: mention.json().data.id }),
    ).toEqual([]);
  });
});
