import { describe, expect, test } from 'bun:test';
import { articleRegistry, parse, sortKeysOf, type Query } from '@nothingleft/query';
import { articleSearchRepository, type TagUsageScope } from '../src/repositories/article-search.repository.ts';
import { articlesRepository } from '../src/repositories/articles.repository.ts';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { tagsRepository } from '../src/repositories/tags.repository.ts';
import { usersRepository } from '../src/repositories/users.repository.ts';
import type { ArticleSearchScope } from '../src/search/article-query.ts';
import type { Queryable } from '../src/client.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import { inRolledBackTx, insertArticle, seedIssueWorld, sys } from './fixtures.ts';

const registry = articleRegistry();
const q = (text: string): Query => parse(text, registry).query;

const scopeOf = (
  ctx: TenantContext,
  userId: number,
  projectIds: number[],
  adminProjectIds: number[] = [],
  ownDraftProjectIds: number[] = projectIds,
): ArticleSearchScope => ({
  orgId: ctx.orgId,
  userId,
  projectIds,
  ownDraftProjectIds,
  adminProjectIds,
  timezone: 'UTC',
  today: '2026-09-26',
  weekStartsOn: 1,
  now: new Date(),
});

const sorted = (ids: number[]) => [...ids].sort((x, y) => x - y);

async function world(tx: Queryable) {
  const base = await seedIssueWorld(tx);
  const { ctxA, ctxB, alice, bob, projectA, projectB, issueA } = base;
  const stamp = Math.random().toString(36).slice(2, 8);
  const carol = await usersRepository(tx).create(sys, { email: `carol-${stamp}@test.local`, name: 'Carol' });
  await organizationsRepository(tx).addMember(ctxA, { user_id: carol.id, username: `carol-${stamp}`, role: 'member' });
  const projectA2 = (
    await projectsRepository(tx).create(ctxA, {
      key: 'KB',
      name: 'Knowledge',
      slug: 'knowledge',
      avatar_color: 'amber',
      avatar_initials: 'KB',
      created_by: alice,
    })
  ).id;

  const articles = articlesRepository(tx);
  const tags = tagsRepository(tx);
  const tagIn = async (ctx: TenantContext, userId: number, name: string, slug: string) => {
    await tags.insertMissing(ctx, [{ name, slug, color: 'amber', created_by: userId }]);
    return (await tags.findBySlugs(ctx, [slug]))[0]!;
  };

  const guide = await insertArticle(tx, ctxA, {
    project_id: projectA,
    created_by: alice,
    title: 'Onboarding Guide',
    body_md: 'How to set up the laptop on day one',
  });
  const setup = await insertArticle(tx, ctxA, {
    project_id: projectA,
    created_by: alice,
    title: 'Laptop setup',
    parent_id: guide.id,
  });
  const vpn = await insertArticle(tx, ctxA, {
    project_id: projectA,
    created_by: alice,
    title: 'VPN access',
    parent_id: setup.id,
  });
  const aliceDraft = await insertArticle(tx, ctxA, {
    project_id: projectA,
    created_by: alice,
    title: 'Alice notes',
    status: 'draft',
  });
  const carolDraft = await insertArticle(tx, ctxA, {
    project_id: projectA,
    created_by: carol.id,
    title: 'Carol notes',
    status: 'draft',
  });
  const deleted = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Deleted page' });
  await articles.update(ctxA, deleted.id, { deleted_at: new Date() });
  const other = await insertArticle(tx, ctxA, {
    project_id: projectA2,
    created_by: carol.id,
    title: 'Other project page',
  });

  const bGuide = await insertArticle(tx, ctxB, {
    project_id: projectB,
    created_by: bob,
    title: 'Onboarding Guide',
    body_md: 'Laptop handover',
  });
  const bChild = await insertArticle(tx, ctxB, {
    project_id: projectB,
    created_by: bob,
    title: 'B child',
    parent_id: bGuide.id,
  });
  const bHandbook = await insertArticle(tx, ctxB, {
    project_id: projectB,
    created_by: bob,
    title: 'Onboarding handbook',
  });

  const runbook = await tagIn(ctxA, alice, 'Runbook', 'runbook');
  const drafty = await tagIn(ctxA, alice, 'Drafty', 'drafty');
  const unused = await tagIn(ctxA, alice, 'Unused', 'unused');
  const runbookB = await tagIn(ctxB, bob, 'Runbook B', 'runbook');
  await articles.applyTags(ctxA, guide.id, [runbook.id]);
  await articles.applyTags(ctxA, setup.id, [runbook.id]);
  await articles.applyTags(ctxA, deleted.id, [runbook.id]);
  await articles.applyTags(ctxA, carolDraft.id, [drafty.id]);
  await articles.applyTags(ctxB, bGuide.id, [runbookB.id]);
  await tags.apply(ctxA, issueA.id, [runbook.id]);

  return {
    ...base,
    carol: carol.id,
    carolUsername: `carol-${stamp}`,
    projectA2,
    guide,
    setup,
    vpn,
    aliceDraft,
    carolDraft,
    deleted,
    other,
    bGuide,
    bChild,
    bHandbook,
    runbook,
    drafty,
    unused,
    runbookB,
  };
}

async function ids(tx: Queryable, ctx: TenantContext, scope: ArticleSearchScope, text: string) {
  const query = q(text);
  const result = await articleSearchRepository(tx).search(ctx, scope, query, {
    sort: sortKeysOf(query),
    limit: 50,
    offset: 0,
  });
  expect(result.total).toBe(result.rows.length);
  return sorted(result.rows.map(r => r.article.id));
}

describe('articleSearchRepository.search', () => {
  test('scope, drafts, free text and every attribute compile to the right rows', async () => {
    await inRolledBackTx(async tx => {
      const w = await world(tx);
      const { ctxA, alice, projectA, projectA2, projectB } = w;
      const scope = scopeOf(ctxA, alice, [projectA, projectA2, projectB]);
      const find = (text: string) => ids(tx, ctxA, scope, text);

      expect(await find('')).toEqual(sorted([w.guide.id, w.setup.id, w.vpn.id, w.aliceDraft.id, w.other.id]));
      expect(await ids(tx, ctxA, scopeOf(ctxA, alice, [projectA]), '')).toEqual(
        sorted([w.guide.id, w.setup.id, w.vpn.id, w.aliceDraft.id]),
      );
      expect(await ids(tx, ctxA, scopeOf(ctxA, alice, [projectA], [projectA]), 'status: draft')).toEqual(
        sorted([w.aliceDraft.id, w.carolDraft.id]),
      );
      expect(await ids(tx, ctxA, scopeOf(ctxA, w.carol, [projectA]), 'status: draft')).toEqual([w.carolDraft.id]);
      expect(await ids(tx, ctxA, scopeOf(ctxA, w.carol, [projectA], [], []), 'status: draft')).toEqual([]);
      expect(await ids(tx, ctxA, scopeOf(ctxA, alice, []), '')).toEqual([]);

      expect(await find('laptop')).toEqual(sorted([w.guide.id, w.setup.id]));
      expect(await find('"day one"')).toEqual([w.guide.id]);
      expect(await find('tag: runbook')).toEqual(sorted([w.guide.id, w.setup.id]));
      expect(await find('tag: -runbook')).toEqual(sorted([w.vpn.id, w.aliceDraft.id, w.other.id]));
      expect(await find('#Runbook')).toEqual(sorted([w.guide.id, w.setup.id]));
      expect(await find('has: tag')).toEqual(sorted([w.guide.id, w.setup.id]));
      expect(await find('status: draft')).toEqual([w.aliceDraft.id]);
      expect(await find('#published')).toEqual(sorted([w.guide.id, w.setup.id, w.vpn.id, w.other.id]));
      expect(await find('parent: {Onboarding Guide}')).toEqual(sorted([w.setup.id, w.vpn.id]));
      expect(await find('parent: onboarding-guide')).toEqual(sorted([w.setup.id, w.vpn.id]));
      expect(await find('parent: {Laptop setup}')).toEqual([w.vpn.id]);
      expect(await find('parent: {No parent}')).toEqual(sorted([w.guide.id, w.aliceDraft.id, w.other.id]));
      expect(await find('created by: me')).toEqual(sorted([w.guide.id, w.setup.id, w.vpn.id, w.aliceDraft.id]));

      const [row] = (await articleSearchRepository(tx).search(ctxA, scope, q('vpn'), { sort: [], limit: 1, offset: 0 }))
        .rows;
      expect(row?.project).toEqual({ key: 'AC', name: 'Acme' });
    });
  });

  test('another organisation’s articles, tags and parents never match', async () => {
    await inRolledBackTx(async tx => {
      const w = await world(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = w;
      const both = [projectA, projectB];

      expect(await ids(tx, ctxB, scopeOf(ctxA, bob, both), '')).toEqual(
        sorted([w.bGuide.id, w.bChild.id, w.bHandbook.id]),
      );
      expect(await ids(tx, ctxB, scopeOf(ctxB, bob, both, both), 'tag: runbook')).toEqual([w.bGuide.id]);
      expect(await ids(tx, ctxB, scopeOf(ctxB, bob, both), 'parent: {Onboarding Guide}')).toEqual([w.bChild.id]);
      expect(await ids(tx, ctxA, scopeOf(ctxA, alice, both, both), 'laptop')).toEqual(sorted([w.guide.id, w.setup.id]));
      expect(await ids(tx, ctxA, scopeOf(ctxA, alice, both), 'parent: {Onboarding Guide}')).toEqual(
        sorted([w.setup.id, w.vpn.id]),
      );
      expect(await ids(tx, ctxA, scopeOf(ctxA, alice, both), 'tag: {Runbook B}')).toEqual([]);
    });
  });
});

describe('articleSearchRepository lookups', () => {
  test('vocabulary lists only the organisation’s tags, visible parents and members', async () => {
    await inRolledBackTx(async tx => {
      const w = await world(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = w;
      const repo = articleSearchRepository(tx);
      const needs = new Set(['tag', 'parent', 'user']);

      const a = await repo.vocabulary(ctxA, scopeOf(ctxA, alice, [projectA, projectB]), needs);
      expect(a.tags.map(t => t.name)).toEqual(['Drafty', 'Runbook', 'Unused']);
      expect(a.parents.map(p => p.title).sort()).toEqual(
        ['Alice notes', 'Laptop setup', 'Onboarding Guide', 'VPN access'].sort(),
      );
      expect(a.usernames).toHaveLength(2);
      expect(a.usernames.some(u => u.username.startsWith('bob-'))).toBe(false);

      const b = await repo.vocabulary(ctxB, scopeOf(ctxA, bob, [projectA, projectB]), needs);
      expect(b.tags.map(t => t.name)).toEqual(['Runbook B']);
      expect(b.parents.map(p => p.title).sort()).toEqual(['B child', 'Onboarding Guide', 'Onboarding handbook']);
      expect(b.usernames.map(u => u.username.split('-')[0])).toEqual(['bob']);

      expect(await repo.vocabulary(ctxA, scopeOf(ctxA, alice, [projectA]), new Set())).toEqual({
        tags: [],
        parents: [],
        usernames: [],
      });
    });
  });

  test('value suggestions answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const w = await world(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = w;
      const repo = articleSearchRepository(tx);
      const scopeA = scopeOf(ctxA, alice, [projectA, projectB]);
      const scopeB = scopeOf(ctxB, bob, [projectA, projectB]);

      expect(await repo.suggestValues(ctxA, scopeA, 'tag', 'run', 10)).toEqual(['Runbook']);
      expect(await repo.suggestValues(ctxB, scopeB, 'tag', 'run', 10)).toEqual(['Runbook B']);
      expect(await repo.suggestValues(ctxA, scopeA, 'tag', '%', 10)).toEqual([]);
      expect(await repo.suggestValues(ctxA, scopeA, 'parent', 'onb', 10)).toEqual(['Onboarding Guide']);
      expect(await repo.suggestValues(ctxB, scopeB, 'parent', 'onb', 10)).toEqual([
        'Onboarding Guide',
        'Onboarding handbook',
      ]);
      expect(await repo.suggestValues(ctxA, scopeA, 'user', 'carol', 10)).toEqual([w.carolUsername]);
      expect(await repo.suggestValues(ctxA, scopeA, 'user', 'bob', 10)).toEqual([]);
      expect(await repo.suggestValues(ctxB, scopeB, 'user', 'carol', 10)).toEqual([]);
      expect(await repo.suggestValues(ctxA, scopeA, 'status', '', 10)).toEqual([]);
    });
  });

  test('parent suggestions and visible ids answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const w = await world(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = w;
      const repo = articleSearchRepository(tx);
      const scopeA = scopeOf(ctxA, alice, [projectA, projectB]);
      const scopeB = scopeOf(ctxB, bob, [projectA, projectB]);

      expect(await repo.parentSuggestions(ctxA, scopeA, 'onb', 10)).toEqual(['Onboarding Guide']);
      expect(await repo.parentSuggestions(ctxB, scopeB, 'onb', 10)).toEqual([
        'Onboarding Guide',
        'Onboarding handbook',
      ]);
      expect(await repo.parentSuggestions(ctxA, scopeA, 'carol', 10)).toEqual([]);
      expect(await repo.parentSuggestions(ctxA, scopeA, '%', 10)).toEqual([]);
    });
  });

  test('tag usage counts visible uses within the organisation; context ranks and filters', async () => {
    await inRolledBackTx(async tx => {
      const w = await world(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectA2, projectB } = w;
      const repo = articleSearchRepository(tx);
      const reader: TagUsageScope = {
        userId: alice,
        issueProjectIds: [projectA],
        articleProjectIds: [projectA, projectA2],
        ownDraftProjectIds: [projectA, projectA2],
        adminProjectIds: [],
      };
      const admin: TagUsageScope = { ...reader, adminProjectIds: [projectA] };
      const page = { limit: 50, offset: 0 };
      const counts = (rows: { tag: { slug: string }; issue_count: number; article_count: number }[]) =>
        rows.map(r => [r.tag.slug, r.issue_count, r.article_count]);

      const all = await repo.tagUsage(ctxA, reader, page);
      expect(all.total).toBe(3);
      expect(counts(all.rows)).toEqual([
        ['drafty', 0, 0],
        ['runbook', 1, 2],
        ['unused', 0, 0],
      ]);
      expect(counts((await repo.tagUsage(ctxA, admin, page)).rows)).toEqual([
        ['drafty', 0, 1],
        ['runbook', 1, 2],
        ['unused', 0, 0],
      ]);
      expect(counts((await repo.tagUsage(ctxA, { ...reader, issueProjectIds: [] }, page)).rows)[1]).toEqual([
        'runbook',
        0,
        2,
      ]);

      const articleInUse = await repo.tagUsage(ctxA, reader, { ...page, context: 'article', inUse: true });
      expect(articleInUse.total).toBe(1);
      expect(counts(articleInUse.rows)).toEqual([['runbook', 1, 2]]);
      const ranked = await repo.tagUsage(ctxA, admin, { ...page, context: 'article' });
      expect(ranked.rows.map(r => r.tag.slug)).toEqual(['runbook', 'drafty', 'unused']);
      const issueInUse = await repo.tagUsage(ctxA, admin, { ...page, context: 'issue', inUse: true });
      expect(issueInUse.rows.map(r => r.tag.slug)).toEqual(['runbook']);
      const inUse = await repo.tagUsage(ctxA, admin, { ...page, inUse: true });
      expect(inUse.rows.map(r => r.tag.slug)).toEqual(['drafty', 'runbook']);
      expect((await repo.tagUsage(ctxA, reader, { ...page, q: 'RUN' })).rows.map(r => r.tag.slug)).toEqual(['runbook']);

      const b = await repo.tagUsage(
        ctxB,
        {
          userId: bob,
          issueProjectIds: [projectA, projectB],
          articleProjectIds: [projectA, projectB],
          ownDraftProjectIds: [projectA, projectB],
          adminProjectIds: [projectA, projectB],
        },
        page,
      );
      expect(b.total).toBe(1);
      expect(b.rows.map(r => [r.tag.name, r.issue_count, r.article_count])).toEqual([['Runbook B', 0, 1]]);
    });
  });
});
