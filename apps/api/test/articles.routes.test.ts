import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { articlesRepository, attachmentsRepository, commentsRepository } from '@nothingleft/db';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import { memoryStorage } from './memory-storage.ts';
import type { Person } from './people.ts';

setDefaultTimeout(120_000);

const KEY = 'KB';
const SHA = Buffer.alloc(32, 9).toString('base64');
const DAY_MS = 86_400_000;

let w: IssueWorld;
let bucket: ReturnType<typeof memoryStorage>;
let n = 0;

interface Node {
  slug: string;
  title: string;
  status: string;
  parent: string | null;
  depth: number;
  position: number;
  child_count: number;
  starred: boolean;
}

const base = `/v1/projects/${KEY}/articles`;
const unique = (title: string) => `${title} ${++n}`;
const create = (who: Person, body: object) => w.call(who, 'POST', base, body);
async function article(who: Person, body: { title: string } & Record<string, unknown>) {
  const res = await create(who, body);
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
  return res.json().data as { slug: string; title: string; position: number; status: string };
}
const get = (who: Person, slug: string) => w.call(who, 'GET', `${base}/${slug}`);
const patch = (who: Person, slug: string, body: object) => w.call(who, 'PATCH', `${base}/${slug}`, body);
const tree = async (who: Person, query = '') => (await w.call(who, 'GET', `${base}${query}`)).json().data as Node[];
const childrenOf = (nodes: Node[], parent: string | null) => nodes.filter(x => x.parent === parent).map(x => x.slug);

async function token(who: Person, scopes: string[]): Promise<Person> {
  const res = await w.call(who, 'POST', '/v1/me/tokens', { name: `t-${scopes.join('-')}-${++n}`, scopes });
  return { email: who.email, sid: '', headers: { authorization: `Bearer ${res.json().data.token}` } };
}

beforeAll(async () => {
  bucket = memoryStorage();
  w = await issueWorld(KEY, { storage: bucket.storage });
});

afterAll(async () => {
  await w.close();
});

describe('the tree', () => {
  test('a category is an article with children; positions follow before / after; depth stops at 3', async () => {
    const root = await article(w.contributor, { title: unique('Runbooks'), status: 'published' });
    const b = await article(w.contributor, { title: 'Second', parent: root.slug });
    const a = await article(w.contributor, { title: 'First', parent: root.slug, before: b.slug });
    const c = await article(w.contributor, { title: 'Third', parent: root.title, after: b.slug });
    const nodes = await tree(w.admin);
    expect(childrenOf(nodes, root.slug)).toEqual([a.slug, b.slug, c.slug]);
    expect(nodes.find(x => x.slug === root.slug)).toMatchObject({ depth: 1, child_count: 3 });

    const leaf = await article(w.contributor, { title: 'Leaf', parent: a.slug });
    expect(nodes.find(x => x.slug === a.slug)?.depth).toBe(2);
    const deeper = await create(w.contributor, { title: 'Too deep', parent: leaf.slug });
    expect(deeper.statusCode).toBe(400);
    expect(deeper.json().error.code).toBe('article.hierarchy_too_deep');

    const cycle = await patch(w.contributor, root.slug, { parent: leaf.slug });
    expect(cycle.json().error.code).toBe('article.hierarchy_cycle');
    expect((await patch(w.contributor, a.slug, { parent: a.slug })).json().error.code).toBe('article.parent_self');
    const moveDeep = await patch(w.contributor, a.slug, { parent: c.slug });
    expect(moveDeep.json().error.code).toBe('article.hierarchy_too_deep');
  });

  test('reorder and reparent renumber both sibling lists', async () => {
    const root = await article(w.contributor, { title: unique('Ops') });
    const x = await article(w.contributor, { title: 'X', parent: root.slug });
    const y = await article(w.contributor, { title: 'Y', parent: root.slug });
    const z = await article(w.contributor, { title: 'Z', parent: root.slug });
    await patch(w.contributor, z.slug, { before: x.slug });
    let nodes = await tree(w.contributor);
    expect(childrenOf(nodes, root.slug)).toEqual([z.slug, x.slug, y.slug]);
    expect(nodes.filter(x => x.parent === root.slug).map(x => x.position)).toEqual([0, 1, 2]);

    const moved = await patch(w.contributor, x.slug, { parent: null });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().data.parent).toBeNull();
    nodes = await tree(w.contributor);
    expect(childrenOf(nodes, root.slug)).toEqual([z.slug, y.slug]);
    expect(nodes.filter(n => n.parent === root.slug).map(n => n.position)).toEqual([0, 1]);

    const notSibling = await patch(w.contributor, y.slug, { after: x.slug });
    expect(notSibling.json().error.code).toBe('article.anchor_not_sibling');
    expect(notSibling.json().error.message).not.toContain('after');
  });

  test('slugs: suffixed on a clash, kept on rename, an explicit clash is refused', async () => {
    const title = unique('Overview');
    const first = await article(w.contributor, { title });
    const second = await article(w.contributor, { title });
    expect(second.slug).toBe(`${first.slug}-2`);
    const renamed = await patch(w.contributor, first.slug, { title: 'Something else entirely' });
    expect(renamed.json().data.slug).toBe(first.slug);
    const clash = await patch(w.contributor, first.slug, { slug: second.slug.toUpperCase() });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().error.code).toBe('article.slug_taken');
    const moved = await patch(w.contributor, first.slug, { slug: `${first.slug} New Home` });
    expect(moved.json().data.slug).toBe(`${first.slug}-new-home`);
    expect((await get(w.contributor, first.slug)).statusCode).toBe(404);
    expect((await patch(w.contributor, second.slug, { slug: '日本' })).json().error.code).toBe('article.slug_invalid');
  });

  test('an unknown or ambiguous name answers with what to use instead', async () => {
    const title = unique('Same name');
    const one = await article(w.contributor, { title });
    const two = await article(w.contributor, { title });
    const res = await create(w.contributor, { title: 'Child', parent: title });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('article.ambiguous');
    expect(res.json().error.valid_values.sort()).toEqual([one.slug, two.slug].sort());
    expect((await create(w.contributor, { title: 'Child', parent: 'no-such-thing' })).statusCode).toBe(404);
  });
});

describe('drafts and visibility', () => {
  test('a draft is its author’s and Project Admins’; published is every member’s', async () => {
    const draft = await article(w.contributor, { title: unique('Draft notes') });
    expect(draft.status).toBe('draft');
    expect((await get(w.contributor, draft.slug)).statusCode).toBe(200);
    expect((await get(w.projectAdmin, draft.slug)).statusCode).toBe(200);
    expect((await get(w.admin, draft.slug)).statusCode).toBe(200);
    expect((await get(w.observer, draft.slug)).statusCode).toBe(404);
    expect((await get(w.outsider, draft.slug)).statusCode).toBe(404);
    expect((await tree(w.observer)).some(x => x.slug === draft.slug)).toBe(false);

    const published = await patch(w.contributor, draft.slug, { status: 'published' });
    expect(published.json().data.published_at).not.toBeNull();
    expect((await get(w.observer, draft.slug)).statusCode).toBe(200);
    const unpublished = await patch(w.contributor, draft.slug, { status: 'draft' });
    expect(unpublished.json().data.published_at).toBe(published.json().data.published_at);
    expect((await get(w.observer, draft.slug)).statusCode).toBe(404);
  });

  test('a published child of a draft parent sits under the nearest article the reader can see', async () => {
    const top = await article(w.projectAdmin, { title: unique('Visible top'), status: 'published' });
    const hidden = await article(w.projectAdmin, { title: 'Hidden middle', parent: top.slug });
    const child = await article(w.projectAdmin, { title: 'Visible child', parent: hidden.slug, status: 'published' });
    const observerView = await tree(w.observer);
    expect(observerView.find(x => x.slug === child.slug)).toMatchObject({ parent: top.slug, depth: 2 });
    expect(observerView.find(x => x.slug === top.slug)?.child_count).toBe(1);
    const read = (await get(w.observer, child.slug)).json().data;
    expect(read.path.map((p: { slug: string }) => p.slug)).toEqual([top.slug]);
    expect(read.parent.slug).toBe(top.slug);
    expect((await tree(w.projectAdmin)).find(x => x.slug === child.slug)?.parent).toBe(hidden.slug);
  });

  test('observers read published articles but change nothing; star and watch are theirs', async () => {
    const doc = await article(w.contributor, { title: unique('Onboarding'), status: 'published' });
    expect((await create(w.observer, { title: 'Nope' })).statusCode).toBe(403);
    expect((await patch(w.observer, doc.slug, { title: 'Nope' })).statusCode).toBe(403);
    expect((await w.call(w.observer, 'DELETE', `${base}/${doc.slug}`)).statusCode).toBe(403);
    const starred = await w.call(w.observer, 'PUT', `${base}/${doc.slug}/star`);
    expect(starred.json().data.me).toMatchObject({ starred: true, watching: true, can_edit: false });
    expect((await tree(w.observer)).find(x => x.slug === doc.slug)?.starred).toBe(true);
    const unwatched = await w.call(w.observer, 'DELETE', `${base}/${doc.slug}/watch`);
    expect(unwatched.json().data.me).toMatchObject({ starred: true, watching: false });
  });

  test('a token reads with issues:read, needs issues:write to write and comments:write to comment', async () => {
    const doc = await article(w.contributor, { title: unique('Token doc'), status: 'published' });
    const reader = await token(w.contributor, ['issues:read']);
    expect((await get(reader, doc.slug)).statusCode).toBe(200);
    const refused = await create(reader, { title: 'By token' });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'issues:write' });
    const writer = await token(w.contributor, ['issues:read', 'issues:write']);
    expect((await create(writer, { title: 'By token' })).statusCode).toBe(201);
    const comment = await w.call(writer, 'POST', `${base}/${doc.slug}/comments`, { body_md: 'hi' });
    expect(comment.json().error).toMatchObject({ code: 'token.scope_missing', scope: 'comments:write' });
    const noRead = await token(w.contributor, ['issues:write']);
    expect((await get(noRead, doc.slug)).json().error.code).toBe('token.scope_missing');
  });
});

describe('deleting and restoring', () => {
  test('with children the caller must choose; move_up puts them in its place', async () => {
    const root = await article(w.contributor, { title: unique('Parent') });
    const before = await article(w.contributor, { title: 'Before', parent: root.slug });
    const middle = await article(w.contributor, { title: 'Middle', parent: root.slug });
    const after = await article(w.contributor, { title: 'After', parent: root.slug });
    const kid1 = await article(w.contributor, { title: 'Kid one', parent: middle.slug });
    const kid2 = await article(w.contributor, { title: 'Kid two', parent: middle.slug });

    const unchosen = await w.call(w.contributor, 'DELETE', `${base}/${middle.slug}`);
    expect(unchosen.statusCode).toBe(400);
    expect(unchosen.json().error).toMatchObject({
      code: 'article.children_choice_required',
      field: 'children',
      valid_values: ['move_up', 'delete'],
    });
    expect(unchosen.json().error.message).not.toContain('move_up');

    const res = await w.call(w.contributor, 'DELETE', `${base}/${middle.slug}?children=move_up`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted_at).not.toBeNull();
    const nodes = await tree(w.contributor);
    expect(childrenOf(nodes, root.slug)).toEqual([before.slug, kid1.slug, kid2.slug, after.slug]);
    expect(nodes.filter(x => x.parent === root.slug).map(x => x.position)).toEqual([0, 1, 2, 3]);

    const restored = await w.call(w.contributor, 'POST', `${base}/${middle.slug}/restore`);
    expect(restored.json().data).toMatchObject({ deleted_at: null, child_count: 0 });
    expect(childrenOf(await tree(w.contributor), root.slug).at(-1)).toBe(middle.slug);
  });

  test('delete takes the subtree, and restore brings back exactly what went with it', async () => {
    const root = await article(w.contributor, { title: unique('Doomed') });
    const kid = await article(w.contributor, { title: 'Doomed kid', parent: root.slug });
    await article(w.contributor, { title: 'Doomed grandkid', parent: kid.slug });
    const res = await w.call(w.contributor, 'DELETE', `${base}/${root.slug}?children=delete`);
    expect(res.statusCode).toBe(200);
    expect((await tree(w.contributor)).some(x => x.slug.startsWith('doomed'))).toBe(false);
    const deleted = await tree(w.contributor, '?deleted=true');
    expect(deleted.filter(x => x.slug.startsWith(root.slug) || x.slug.startsWith('doomed')).length).toBe(3);

    const taken = await article(w.contributor, { title: root.title });
    expect(taken.slug).toBe(root.slug);
    const restored = await w.call(w.contributor, 'POST', `${base}/${root.slug}/restore`);
    expect(restored.statusCode).toBe(200);
    expect(restored.json().data.slug).toBe(`${root.slug}-2`);
    expect(restored.json().data.child_count).toBe(1);
    const nodes = await tree(w.contributor);
    expect(childrenOf(nodes, `${root.slug}-2`)).toEqual([kid.slug]);
    expect(childrenOf(nodes, kid.slug)).toHaveLength(1);
  });

  test('a contributor deletes only their own, and a subtree only when all of it is theirs', async () => {
    const mine = await article(w.contributor, { title: unique('Mine') });
    await article(w.projectAdmin, { title: 'Theirs under mine', parent: mine.slug, status: 'published' });
    const refused = await w.call(w.contributor, 'DELETE', `${base}/${mine.slug}?children=delete`);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('article.delete_subtree_forbidden');
    expect((await w.call(w.contributor, 'DELETE', `${base}/${mine.slug}?children=move_up`)).statusCode).toBe(200);

    const theirs = await article(w.projectAdmin, { title: unique('Theirs'), status: 'published' });
    expect((await w.call(w.contributor, 'DELETE', `${base}/${theirs.slug}`)).statusCode).toBe(403);
    expect((await w.call(w.projectAdmin, 'DELETE', `${base}/${theirs.slug}`)).statusCode).toBe(200);
  });

  test('restore expires after 14 days and the nightly purge removes the rows', async () => {
    const doc = await article(w.contributor, { title: unique('Old') });
    await w.call(w.contributor, 'DELETE', `${base}/${doc.slug}`);
    const repo = articlesRepository(w.db);
    const row = await repo.findDeletedBySlug(w.repos.ctx, w.repos.projectId, doc.slug);
    await repo.update(w.repos.ctx, row!.id, { deleted_at: new Date(Date.now() - 15 * DAY_MS) });
    expect((await w.call(w.contributor, 'POST', `${base}/${doc.slug}/restore`)).statusCode).toBe(404);
    await w.app.jobHandlers['issues.purge']();
    expect(await repo.findById(w.repos.ctx, row!.id)).toBeUndefined();
  });
});

describe('review fixes', () => {
  test('a restored branch that would now sit deeper than 3 comes back at the top level', async () => {
    const p = await article(w.contributor, { title: unique('Deep P') });
    const a = await article(w.contributor, { title: 'Deep A', parent: p.slug });
    const b = await article(w.contributor, { title: 'Deep B', parent: a.slug });
    await w.call(w.contributor, 'DELETE', `${base}/${a.slug}?children=delete`);
    const q = await article(w.contributor, { title: unique('Deep Q') });
    expect((await patch(w.contributor, p.slug, { parent: q.slug })).statusCode).toBe(200);
    const restored = await w.call(w.contributor, 'POST', `${base}/${a.slug}/restore`);
    expect(restored.json().data.parent).toBeNull();
    const nodes = await tree(w.contributor);
    expect(nodes.find(x => x.slug === b.slug)?.depth).toBe(2);
    expect(Math.max(...nodes.map(x => x.depth))).toBeLessThanOrEqual(3);
  });

  test('restoring a branch needs the right to delete every article in it', async () => {
    const mine = await article(w.contributor, { title: unique('Shared branch'), status: 'published' });
    await article(w.projectAdmin, { title: 'Admin child', parent: mine.slug, status: 'published' });
    expect((await w.call(w.projectAdmin, 'DELETE', `${base}/${mine.slug}?children=delete`)).statusCode).toBe(200);
    const refused = await w.call(w.contributor, 'POST', `${base}/${mine.slug}/restore`);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('article.restore_subtree_forbidden');
    expect((await w.call(w.projectAdmin, 'POST', `${base}/${mine.slug}/restore`)).json().data.child_count).toBe(1);
  });

  test('a draft the caller cannot see neither counts as a child nor blocks a delete; it moves up', async () => {
    const top = await article(w.contributor, { title: unique('Hidden kids'), status: 'published' });
    const hidden = await article(w.projectAdmin, { title: 'Admin draft', parent: top.slug });
    expect((await get(w.contributor, top.slug)).json().data.child_count).toBe(0);
    expect((await w.call(w.contributor, 'DELETE', `${base}/${top.slug}`)).statusCode).toBe(200);
    expect((await tree(w.projectAdmin)).find(x => x.slug === hidden.slug)?.parent).toBeNull();

    const branch = await article(w.contributor, { title: unique('Mixed branch'), status: 'published' });
    const own = await article(w.contributor, { title: 'Own kid', parent: branch.slug });
    const draft = await article(w.projectAdmin, { title: 'Draft under own kid', parent: own.slug });
    expect((await w.call(w.contributor, 'DELETE', `${base}/${branch.slug}?children=delete`)).statusCode).toBe(200);
    const adminView = await tree(w.projectAdmin);
    expect(adminView.some(x => x.slug === own.slug)).toBe(false);
    expect(adminView.find(x => x.slug === draft.slug)?.parent).toBeNull();
  });

  test('sending the unchanged parent keeps the article where it is', async () => {
    const root = await article(w.contributor, { title: unique('Keep order') });
    const x = await article(w.contributor, { title: 'Keep X', parent: root.slug });
    const y = await article(w.contributor, { title: 'Keep Y', parent: root.slug });
    await patch(w.contributor, x.slug, { parent: root.slug, title: 'Keep X renamed' });
    expect(childrenOf(await tree(w.contributor), root.slug)).toEqual([x.slug, y.slug]);
  });

  test('listing tags needs no more than any token scope', async () => {
    const admin = await token(w.admin, ['admin:project']);
    expect((await w.call(admin, 'GET', '/v1/tags')).statusCode).toBe(200);
  });

  test('an author demoted to Observer no longer finds their drafts anywhere', async () => {
    const draft = await article(w.contributor, { title: unique('Demoted draft'), tags: ['demotion'] });
    const setRole = (role: string) =>
      w.call(w.admin, 'PATCH', `/v1/projects/${KEY}/members/${w.contributor.username}`, { role });
    expect((await setRole('observer')).statusCode).toBe(200);
    try {
      expect((await get(w.contributor, draft.slug)).statusCode).toBe(404);
      const found = await w.call(w.contributor, 'GET', `/v1/articles?q=${encodeURIComponent('tag: demotion')}`);
      expect(found.json().data).toEqual([]);
      const tags = (await w.call(w.contributor, 'GET', '/v1/tags?q=demotion')).json().data;
      expect(tags[0].article_count).toBe(0);
    } finally {
      await setRole('contributor');
    }
  });
});

describe('for the web', () => {
  test('the project says whether the caller may create and move articles', async () => {
    const kb = async (who: Person) => (await w.call(who, 'GET', `/v1/projects/${KEY}`)).json().data.knowledge_base;
    expect(await kb(w.contributor)).toEqual({ can_create: true, can_move: true });
    expect(await kb(w.observer)).toEqual({ can_create: false, can_move: false });
    const reader = await token(w.admin, ['issues:read']);
    expect(await kb(reader)).toEqual({ can_create: false, can_move: false });
  });

  test('ui preferences merge by top-level key; null removes one; the total is bounded', async () => {
    const set = (ui: object) => w.call(w.contributor, 'PATCH', '/v1/me/preferences', { ui });
    await set({ kb_collapsed: { [KEY]: ['runbooks'] }, other: 1 });
    const merged = await set({ kb_collapsed: { [KEY]: ['runbooks', 'api'] } });
    expect(merged.json().data.preferences.ui).toEqual({ kb_collapsed: { [KEY]: ['runbooks', 'api'] }, other: 1 });
    expect((await set({ other: null })).json().data.preferences.ui).toEqual({
      kb_collapsed: { [KEY]: ['runbooks', 'api'] },
    });
    const big = await set({ blob: 'x'.repeat(17 * 1024) });
    expect(big.statusCode).toBe(400);
    expect(big.json().error).toMatchObject({ code: 'preferences.ui_too_large', field: 'ui' });
  });
});

describe('tags', () => {
  test('articles share the organisation’s tags; counts split by type and rank by context', async () => {
    const tagName = `Payment Outage ${++n}`;
    const issue = (
      await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Payments down', tags: [tagName] })
    ).json().data.key as string;
    const rca = await article(w.contributor, { title: unique('RCA'), status: 'published', tags: [tagName] });
    const res = await w.call(w.contributor, 'POST', `${base}/${rca.slug}/tags`, { tags: ['rca'] });
    expect(res.json().data.tags.map((t: { name: string }) => t.name)).toEqual([tagName, 'rca']);

    const slug = tagName.toLowerCase().replaceAll(' ', '-');
    const list = (await w.call(w.contributor, 'GET', `/v1/tags?q=${encodeURIComponent(slug)}`)).json().data;
    expect(list).toEqual([expect.objectContaining({ slug, issue_count: 1, article_count: 1 })]);
    const cloud = (await w.call(w.observer, 'GET', `/v1/tags?context=article&in_use=true&project=${KEY}`)).json().data;
    expect(cloud.map((t: { slug: string }) => t.slug)).toContain('rca');
    expect(cloud.every((t: { article_count: number }) => t.article_count > 0)).toBe(true);

    const removed = await w.call(w.contributor, 'DELETE', `${base}/${rca.slug}/tags/rca`);
    expect(removed.json().data.tags).toHaveLength(1);
    expect((await w.call(w.contributor, 'DELETE', `${base}/${rca.slug}/tags/rca`)).json().error.code).toBe(
      'article.not_tagged',
    );
    expect(issue).toMatch(/^KB-/);
  });
});

describe('comments and attachments', () => {
  test('comments hang off the article: one parent, mentions, own-only edits', async () => {
    const doc = await article(w.contributor, { title: unique('Discussed'), status: 'published' });
    const url = `${base}/${doc.slug}/comments`;
    const res = await w.call(w.contributor, 'POST', url, { body_md: `Thoughts, @${w.observer.username}?` });
    expect(res.statusCode).toBe(201);
    const comment = res.json().data;
    expect(comment.article).toEqual({ project: KEY, slug: doc.slug });

    const [row] = await commentsRepository(w.db).findLive(w.repos.ctx, [comment.id]);
    expect(row!.comment).toMatchObject({ issue_id: null });
    expect(row!.comment.article_id).not.toBeNull();
    const mentionsOf = (id: number) => articlesRepository(w.db).mentionsOf(w.repos.ctx, { type: 'comment', id });
    expect(await mentionsOf(comment.id)).toEqual([
      expect.objectContaining({ source_type: 'comment', issue_id: null, article_id: row!.comment.article_id }),
    ]);

    expect((await w.call(w.observer, 'POST', url, { body_md: 'nope' })).statusCode).toBe(403);
    expect((await w.call(w.projectAdmin, 'PATCH', `${url}/${comment.id}`, { body_md: 'edited' })).statusCode).toBe(200);
    const other = (await w.call(w.projectAdmin, 'POST', url, { body_md: 'mine' })).json().data;
    expect((await w.call(w.contributor, 'PATCH', `${url}/${other.id}`, { body_md: 'x' })).statusCode).toBe(403);
    expect((await get(w.contributor, doc.slug)).json().data.comment_count).toBe(2);
    expect((await w.call(w.contributor, 'DELETE', `${url}/${comment.id}`)).statusCode).toBe(200);
    const list = (await w.call(w.contributor, 'GET', url)).json();
    expect(list.data.map((c: { id: number }) => c.id)).toEqual([other.id]);
    expect(await mentionsOf(comment.id)).toEqual([]);
  });

  test('an article body’s mentions hang off the article alone', async () => {
    const doc = await article(w.contributor, { title: unique('Mentioning'), body_md: `Ask @${w.admin.username}.` });
    const repo = articlesRepository(w.db);
    const row = await repo.findLiveBySlug(w.repos.ctx, w.repos.projectId, doc.slug);
    const mentions = await repo.mentionsOf(w.repos.ctx, { type: 'article', id: row!.id });
    expect(mentions).toEqual([expect.objectContaining({ source_type: 'article', source_id: row!.id, issue_id: null })]);
  });

  test('files: uploaded onto an article or its comment, claimed at creation, never also on an issue', async () => {
    const upload = async (body: object) => {
      const res = await w.call(w.contributor, 'POST', '/v1/attachments/presign', {
        filename: 'diagram.png',
        mime: 'image/png',
        size: 500,
        sha256: SHA,
        ...body,
      });
      if (res.statusCode !== 201) throw new Error(res.body);
      const { attachment, upload_url } = res.json().data;
      bucket.upload(new URL(upload_url).pathname.split('/').slice(2).join('/'), 500, SHA);
      return (await w.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`)).json().data;
    };
    const draft = await upload({ project: KEY });
    expect(draft.article).toBeNull();
    const doc = await article(w.contributor, {
      title: unique('With files'),
      body_md: `![d](${draft.url})`,
      attachment_ids: [draft.id],
    });
    const onArticle = await upload({ project: KEY, article: doc.slug });
    expect(onArticle.article).toEqual({ project: KEY, slug: doc.slug });
    expect(onArticle.issue).toBeNull();
    const comment = (
      await w.call(w.contributor, 'POST', `${base}/${doc.slug}/comments`, { body_md: 'see file' })
    ).json().data;
    const onComment = await upload({ project: KEY, article: doc.slug, comment_id: comment.id });
    expect(onComment.comment_id).toBe(comment.id);

    const files = (await w.call(w.contributor, 'GET', `${base}/${doc.slug}/attachments`)).json().data;
    expect(files.map((f: { id: string }) => f.id).sort()).toEqual([draft.id, onArticle.id, onComment.id].sort());
    expect(files.find((f: { id: string }) => f.id === draft.id).inline).toBe(true);
    const onlyComment = (
      await w.call(w.contributor, 'GET', `${base}/${doc.slug}/comments/${comment.id}/attachments`)
    ).json().data;
    expect(onlyComment.map((f: { id: string }) => f.id)).toEqual([onComment.id]);

    const stored = await attachmentsRepository(w.db).findByPublicId(w.repos.ctx, onComment.id);
    expect(stored).toMatchObject({ issue_id: null, work_item_id: null, comment_id: comment.id });
    expect(stored!.article_id).not.toBeNull();
    expect((await get(w.contributor, doc.slug)).json().data.attachment_count).toBe(3);

    const secret = await article(w.projectAdmin, { title: unique('Secret') });
    expect(
      (
        await w.call(w.contributor, 'POST', '/v1/attachments/presign', {
          filename: 'x.png',
          mime: 'image/png',
          size: 1,
          sha256: SHA,
          project: KEY,
          article: secret.slug,
        })
      ).statusCode,
    ).toBe(404);
    const refused = await w.call(w.contributor, 'POST', '/v1/attachments/presign', {
      filename: 'x.png',
      mime: 'image/png',
      size: 1,
      sha256: SHA,
      article: doc.slug,
    });
    expect(refused.statusCode).toBe(400);
  });
});

describe('search', () => {
  test('the article query language: tag, status, parent, people, free text', async () => {
    const runbooks = await article(w.contributor, { title: unique('Runbook shelf'), status: 'published' });
    const sync = await article(w.contributor, {
      title: 'Restoring a failed sync',
      body_md: 'When the nightly synchronisation stalls, restart the worker.',
      parent: runbooks.slug,
      status: 'published',
      tags: ['devops'],
    });
    const draft = await article(w.contributor, { title: 'Draft sync notes', parent: sync.slug, tags: ['devops'] });
    const search = async (who: Person, q: string) => {
      const res = await w.call(who, 'GET', `/v1/articles?project=${KEY}&q=${encodeURIComponent(q)}`);
      if (res.statusCode !== 200) throw new Error(res.body);
      return (res.json().data as { slug: string }[]).map(a => a.slug);
    };
    expect(await search(w.contributor, 'tag: devops')).toEqual(expect.arrayContaining([sync.slug, draft.slug]));
    expect(await search(w.observer, 'tag: devops')).toEqual([sync.slug]);
    expect(await search(w.contributor, 'status: draft tag: devops')).toEqual([draft.slug]);
    expect((await search(w.contributor, `parent: {${runbooks.title}}`)).sort()).toEqual([sync.slug, draft.slug].sort());
    expect(await search(w.contributor, 'synchronisation stalls')).toEqual([sync.slug]);
    expect(await search(w.contributor, `created by: me tag: devops status: published`)).toEqual([sync.slug]);

    const hit = (await w.call(w.contributor, 'GET', `/v1/articles?q=stalls`)).json().data[0];
    expect(hit.excerpt).toContain('stalls');
    expect(hit.parent.slug).toBe(runbooks.slug);

    const bad = await w.call(w.contributor, 'GET', `/v1/articles?q=${encodeURIComponent('status: archived')}`);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatchObject({ code: 'query.invalid_value', valid_values: ['Draft', 'Published'] });
    const unknown = await w.call(w.contributor, 'GET', `/v1/articles?q=${encodeURIComponent('priority: High')}`);
    expect(unknown.json().error.code).toBe('query.unknown_attribute');
  });

  test('the grouped search returns issues and articles apart, and one tag across both', async () => {
    const tagName = `incident-${++n}`;
    const issue = (
      await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Gateway 502s', tags: [tagName] })
    ).json().data.key as string;
    const doc = await article(w.contributor, { title: unique('Gateway RCA'), status: 'published', tags: [tagName] });
    const res = await w.call(w.observer, 'GET', `/v1/search?q=${encodeURIComponent(`tag: ${tagName}`)}`);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.issues.items.map((i: { key: string }) => i.key)).toEqual([issue]);
    expect(data.issues.items[0].project.key).toBe(KEY);
    expect(data.articles.items.map((a: { slug: string }) => a.slug)).toEqual([doc.slug]);
    expect(data.issues.error).toBeNull();

    const onlyIssues = (await w.call(w.observer, 'GET', `/v1/search?q=${encodeURIComponent('has: assignee')}`)).json()
      .data;
    expect(onlyIssues.articles.error.code).toMatch(/^query\./);
    expect(onlyIssues.issues.error).toBeNull();
    const neither = await w.call(w.observer, 'GET', `/v1/search?q=${encodeURIComponent('nonsense: x')}`);
    expect(neither.statusCode).toBe(400);
  });

  test('autocomplete in the article vocabulary', async () => {
    const res = await w.call(
      w.contributor,
      'GET',
      `/v1/search/suggest?kind=articles&q=${encodeURIComponent('status: Dr')}`,
    );
    expect(res.json().data.map((s: { label: string }) => s.label)).toContain('Draft');
    const attrs = await w.call(w.contributor, 'GET', `/v1/search/suggest?kind=articles&q=pri`);
    expect(attrs.json().data).toEqual([]);
  });
});

describe('referenced by', () => {
  test('an issue lists the articles whose body names its key, as each reader may see them', async () => {
    const key = (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Flaky login' })).json().data.key;
    const open = await article(w.contributor, {
      title: unique('Login notes'),
      body_md: `See ${key} for the history.`,
      status: 'published',
    });
    const draft = await article(w.contributor, { title: unique('Private notes'), body_md: `Also ${key}.` });
    await article(w.contributor, { title: unique('Code only'), body_md: `\`${key}\``, status: 'published' });
    const slugs = async (who: Person) =>
      ((await w.call(who, 'GET', `/v1/issues/${key}/articles`)).json().data as { slug: string }[]).map(a => a.slug);
    expect((await slugs(w.contributor)).sort()).toEqual([open.slug, draft.slug].sort());
    expect(await slugs(w.observer)).toEqual([open.slug]);

    await patch(w.contributor, open.slug, { body_md: 'No longer.' });
    expect(await slugs(w.observer)).toEqual([]);
    await w.call(w.contributor, 'DELETE', `${base}/${draft.slug}`);
    expect(await slugs(w.contributor)).toEqual([]);
    expect((await w.call(w.outsider, 'GET', `/v1/issues/${key}/articles`)).statusCode).toBe(404);
  });

  test('a key written before its issue exists starts counting when it does', async () => {
    const issues = (
      await w.call(w.admin, 'GET', `/v1/issues?project=${KEY}&limit=1&sort=${encodeURIComponent('key desc')}`)
    ).json().data;
    const next = `${KEY}-${Number(issues[0].key.split('-')[1]) + 1}`;
    const doc = await article(w.contributor, {
      title: unique('Forward ref'),
      body_md: `Tracked in ${next}.`,
      status: 'published',
    });
    const created = (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Later' })).json().data.key;
    expect(created).toBe(next);
    const list = (await w.call(w.observer, 'GET', `/v1/issues/${next}/articles`)).json().data;
    expect(list.map((a: { slug: string }) => a.slug)).toEqual([doc.slug]);
  });
});

describe('tenancy and archive', () => {
  test('another organisation never sees the knowledge base', async () => {
    const doc = await article(w.contributor, { title: unique('Internal'), status: 'published' });
    expect((await get(w.outsider, doc.slug)).statusCode).toBe(404);
    expect((await w.call(w.outsider, 'GET', base)).statusCode).toBe(404);
  });

  test('an archived project is read-only', async () => {
    const doc = await article(w.contributor, { title: unique('Frozen'), status: 'published' });
    await w.call(w.admin, 'POST', `/v1/projects/${KEY}/archive`);
    try {
      expect((await patch(w.contributor, doc.slug, { title: 'x' })).statusCode).toBe(409);
      expect((await create(w.contributor, { title: 'x' })).statusCode).toBe(409);
      expect((await get(w.contributor, doc.slug)).json().data.me.can_edit).toBe(false);
    } finally {
      await w.call(w.admin, 'POST', `/v1/projects/${KEY}/unarchive`);
    }
  });
});
