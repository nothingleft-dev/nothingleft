import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import type { Person } from './people.ts';

setDefaultTimeout(120_000);

const KEY = 'TGM';
let w: IssueWorld;

const newIssue = async (tags: string[]) =>
  (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Tagged', tags })).json().data.key as string;
const newArticle = async (title: string, tags: string[]) => {
  const res = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/articles`, { title, tags, status: 'published' });
  if (res.statusCode !== 201) throw new Error(res.body);
};
const managed = async (who: Person = w.admin, q = '') =>
  w.call(who, 'GET', `/v1/tags/manage${q ? `?q=${encodeURIComponent(q)}` : ''}`);
const tagsOf = async (key: string) =>
  (await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data.tags.map((t: { name: string }) => t.name) as string[];
const view = async (name: string, query: string, who: Person = w.admin) => {
  const res = await w.call(who, 'POST', '/v1/saved-views', { name, query, visibility: 'org' });
  if (res.statusCode !== 201) throw new Error(res.body);
};
const viewQuery = async (name: string) =>
  ((await w.call(w.admin, 'GET', '/v1/saved-views')).json().data as { name: string; query: string }[]).find(
    v => v.name === name,
  )?.query;
const audit = async (kind: string) =>
  (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity?kind=${kind}`)).json().data as {
    old_value: unknown;
    new_value: unknown;
  }[];

beforeAll(async () => {
  w = await issueWorld(KEY);
});

afterAll(async () => {
  await w.close();
});

describe('the management list', () => {
  test('counts every tag across the organisation, split by issues and articles, unused ones too', async () => {
    await newIssue(['rca', 'payment-outage']);
    await newIssue(['rca']);
    await newArticle('Outage RCA', ['rca']);
    await w.call(w.admin, 'POST', `/v1/issues/${await newIssue(['unused-soon'])}/tags`, { tags: ['other'] });
    const res = await managed();
    expect(res.statusCode).toBe(200);
    const bySlug = Object.fromEntries(
      res
        .json()
        .data.map((t: { slug: string; issue_count: number; article_count: number }) => [
          t.slug,
          [t.issue_count, t.article_count],
        ]),
    );
    expect(bySlug).toMatchObject({ rca: [2, 1], 'payment-outage': [1, 0] });
    expect(res.json().meta.pagination.total).toBeGreaterThanOrEqual(4);
    expect((await managed(w.admin, 'payment')).json().data.map((t: { slug: string }) => t.slug)).toEqual([
      'payment-outage',
    ]);
  });

  test('Project Admins anywhere may open it; contributors and observers may not', async () => {
    expect((await managed(w.projectAdmin)).statusCode).toBe(200);
    expect((await managed(w.contributor)).statusCode).toBe(403);
    expect((await managed(w.observer)).statusCode).toBe(403);
  });
});

describe('rename and recolour', () => {
  test('a rename moves the slug, rewrites saved views and is recorded', async () => {
    const key = await newIssue(['Needs Review']);
    await view('Review queue', 'tag: "Needs Review", needs-review #Unresolved');
    const res = await w.call(w.projectAdmin, 'PATCH', '/v1/tags/needs-review', { name: 'Awaiting QA' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ name: 'Awaiting QA', slug: 'awaiting-qa', issue_count: 1 });
    expect(await tagsOf(key)).toEqual(['Awaiting QA']);
    expect(await viewQuery('Review queue')).toBe('tag: {Awaiting QA} #Unresolved');
    expect(await audit('tag_renamed')).toMatchObject([
      { old_value: { name: 'Needs Review' }, new_value: { name: 'Awaiting QA' } },
    ]);
    const found = await w.call(w.admin, 'GET', `/v1/issues?q=${encodeURIComponent('tag: awaiting-qa')}`);
    expect(found.json().data.map((i: { key: string }) => i.key)).toEqual([key]);
  });

  test('a name another tag already has is refused, pointing at merge', async () => {
    await newIssue(['taken-a', 'taken-b']);
    const res = await w.call(w.admin, 'PATCH', '/v1/tags/taken-a', { name: 'Taken B' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'tag.slug_taken', field: 'name', valid_values: ['taken-b'] });
  });

  test('a recolour alone changes the colour and records nothing', async () => {
    await newIssue(['paint-me']);
    const before = (await audit('tag_renamed')).length;
    const res = await w.call(w.projectAdmin, 'PATCH', '/v1/tags/paint-me', { color: 'teal-3' });
    expect(res.json().data).toMatchObject({ slug: 'paint-me', color: 'teal-3' });
    expect((await audit('tag_renamed')).length).toBe(before);
  });

  test('a contributor may not rename; an unknown tag is not found', async () => {
    expect((await w.call(w.contributor, 'PATCH', '/v1/tags/rca', { name: 'RCA!' })).statusCode).toBe(403);
    const missing = await w.call(w.admin, 'PATCH', '/v1/tags/never-made', { color: 'red-1' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('tag.not_found');
  });

  test('a token needs admin:project to rename', async () => {
    const make = async (scopes: string[]) =>
      (await w.call(w.projectAdmin, 'POST', '/v1/me/tokens', { name: scopes.join(' '), scopes })).json().data
        .token as string;
    const narrow = { email: '', sid: '', headers: { authorization: `Bearer ${await make(['issues:write'])}` } };
    const res = await w.call(narrow, 'PATCH', '/v1/tags/paint-me', { color: 'red-1' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('token.scope_missing');
    const wide = { email: '', sid: '', headers: { authorization: `Bearer ${await make(['admin:project'])}` } };
    expect((await w.call(wide, 'PATCH', '/v1/tags/paint-me', { color: 'red-2' })).statusCode).toBe(200);
  });
});

describe('merge and delete', () => {
  test('merge moves issues and articles onto the target once, deletes the sources and rewrites views', async () => {
    const both = await newIssue(['bug-ui', 'ui-bug']);
    const one = await newIssue(['frontend-bug']);
    await newArticle('UI notes', ['frontend-bug']);
    await view('UI bugs', 'tag: bug-ui, frontend-bug, ui-bug');
    const res = await w.call(w.admin, 'POST', '/v1/tags/merge', { tags: ['bug-ui', 'Frontend Bug'], into: 'ui-bug' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ slug: 'ui-bug', issue_count: 2, article_count: 1 });
    expect(await tagsOf(both)).toEqual(['ui-bug']);
    expect(await tagsOf(one)).toEqual(['ui-bug']);
    expect((await managed(w.admin, 'bug')).json().data.map((t: { slug: string }) => t.slug)).toEqual(['ui-bug']);
    expect(await viewQuery('UI bugs')).toBe('tag: ui-bug');
    expect(await audit('tag_merged')).toMatchObject([
      { old_value: { names: ['bug-ui', 'frontend-bug'] }, new_value: { name: 'ui-bug' } },
    ]);
  });

  test('merging into itself, or as a Project Admin, is refused', async () => {
    const self = await w.call(w.admin, 'POST', '/v1/tags/merge', { tags: ['ui-bug'], into: 'ui-bug' });
    expect(self.json().error.code).toBe('tag.merge_into_self');
    const admin = await w.call(w.projectAdmin, 'POST', '/v1/tags/merge', { tags: ['rca'], into: 'ui-bug' });
    expect(admin.statusCode).toBe(403);
  });

  test('delete removes the tag from every issue and article and records the counts', async () => {
    const key = await newIssue(['doomed', 'kept']);
    await newArticle('Doomed doc', ['doomed']);
    expect((await w.call(w.projectAdmin, 'DELETE', '/v1/tags/doomed')).statusCode).toBe(403);
    const res = await w.call(w.admin, 'DELETE', '/v1/tags/doomed');
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ slug: 'doomed', issue_count: 1, article_count: 1 });
    expect(await tagsOf(key)).toEqual(['kept']);
    expect(await audit('tag_deleted')).toMatchObject([
      { old_value: { name: 'doomed', issue_count: 1, article_count: 1 }, new_value: null },
    ]);
    expect((await w.call(w.admin, 'DELETE', '/v1/tags/doomed')).statusCode).toBe(404);
  });
});
