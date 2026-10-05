import { describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { articlesRepository } from '../src/repositories/articles.repository.ts';
import { attachmentsRepository } from '../src/repositories/attachments.repository.ts';
import { commentsRepository } from '../src/repositories/comments.repository.ts';
import { tagsRepository } from '../src/repositories/tags.repository.ts';
import { schema } from '../src/index.ts';
import type { Queryable } from '../src/client.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import { failsInSavepoint, inRolledBackTx, insertArticle, seedIssueWorld, sys } from './fixtures.ts';

async function tagIn(tx: Queryable, ctx: TenantContext, userId: number, slug: string) {
  const tags = tagsRepository(tx);
  await tags.insertMissing(ctx, [{ name: slug, slug, color: 'amber', created_by: userId }]);
  const [tag] = await tags.findBySlugs(ctx, [slug]);
  return tag!;
}

const file = (userId: number, articleId: number | null) => ({
  public_id: crypto.randomUUID(),
  article_id: articleId,
  filename: 'diagram.png',
  mime_type: 'image/png',
  size_bytes: 10,
  checksum: Buffer.alloc(32),
  storage_target: 'platform',
  bucket: 'nl-private',
  object_key: 'api/x',
  created_by: userId,
  completed_at: new Date(),
});

describe('articlesRepository tenant isolation', () => {
  test('insert refuses another organisation’s project and parent', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const a = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Runbook' });
      expect(a.org_id).toBe(ctxA.orgId);
      expect(a.updated_by).toBe(alice);
      expect(
        await failsInSavepoint(tx, sp =>
          insertArticle(sp, ctxB, { project_id: projectA, created_by: bob, title: 'x' }),
        ),
      ).toBe(true);
      expect(
        await failsInSavepoint(tx, sp =>
          insertArticle(sp, ctxB, { project_id: projectB, created_by: bob, title: 'x', parent_id: a.id }),
        ),
      ).toBe(true);
    });
  });

  test('finds, locks and updates answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = articlesRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const a = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Release Checklist' });
      const b = await insertArticle(tx, ctxB, { project_id: projectB, created_by: bob, title: 'Release Checklist' });

      expect((await repo.findById(ctxA, a.id))?.id).toBe(a.id);
      expect(await repo.findById(ctxB, a.id)).toBeUndefined();
      expect((await repo.findByIds(ctxA, [a.id, b.id])).map(r => r.id)).toEqual([a.id]);
      expect(await repo.findByIds(ctxB, [a.id])).toEqual([]);
      expect(await repo.lockById(ctxB, a.id)).toBeUndefined();
      expect((await repo.lockById(ctxA, a.id))?.id).toBe(a.id);

      expect((await repo.findLiveBySlug(ctxA, projectA, 'RELEASE-CHECKLIST'))?.id).toBe(a.id);
      expect(await repo.findLiveBySlug(ctxB, projectA, 'release-checklist')).toBeUndefined();
      expect((await repo.findLiveByTitle(ctxA, projectA, 'release checklist')).map(r => r.id)).toEqual([a.id]);
      expect(await repo.findLiveByTitle(ctxB, projectA, 'release checklist')).toEqual([]);

      expect(await repo.update(ctxB, a.id, { title: 'hijacked' })).toBeUndefined();
      expect((await repo.findById(ctxA, a.id))?.title).toBe('Release Checklist');
      await repo.update(ctxA, a.id, { deleted_at: new Date() });
      expect(await repo.findLiveBySlug(ctxA, projectA, 'release-checklist')).toBeUndefined();
      expect((await repo.findDeletedBySlug(ctxA, projectA, 'release-checklist'))?.id).toBe(a.id);
      expect(await repo.findDeletedBySlug(ctxB, projectA, 'release-checklist')).toBeUndefined();
      expect((await repo.findLiveBySlug(ctxB, projectB, 'release-checklist'))?.id).toBe(b.id);
    });
  });

  test('tree, slugs, positions and soft delete stay within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = articlesRepository(tx);
      const { ctxA, ctxB, alice, projectA } = await seedIssueWorld(tx);
      const root = await insertArticle(tx, ctxA, {
        project_id: projectA,
        created_by: alice,
        title: 'Guide',
        position: 1,
      });
      const child = await insertArticle(tx, ctxA, {
        project_id: projectA,
        created_by: alice,
        title: 'Setup',
        parent_id: root.id,
        position: 0,
      });

      await repo.lockTree(ctxA, projectA);
      await repo.lockTree(ctxB, projectA);
      expect((await repo.tree(ctxA, projectA)).map(r => r.id)).toEqual([child.id, root.id]);
      expect(await repo.tree(ctxB, projectA)).toEqual([]);
      expect(await repo.liveSlugs(ctxA, projectA)).toEqual(new Set(['guide', 'setup']));
      expect(await repo.liveSlugs(ctxB, projectA)).toEqual(new Set());

      await repo.setPositions(ctxB, [{ id: root.id, position: 9 }]);
      expect((await repo.findById(ctxA, root.id))?.position).toBe(1);
      await repo.setPositions(ctxA, [
        { id: root.id, position: 0 },
        { id: child.id, position: 5 },
      ]);
      expect((await repo.tree(ctxA, projectA)).map(r => r.id)).toEqual([root.id, child.id]);

      const at = new Date('2026-09-20T10:00:00.123Z');
      await repo.softDelete(ctxB, [root.id, child.id], at);
      expect((await repo.tree(ctxA, projectA)).length).toBe(2);
      await repo.softDelete(ctxA, [root.id, child.id], at);
      await repo.softDelete(ctxA, [root.id], new Date());
      expect(await repo.tree(ctxA, projectA)).toEqual([]);
      expect((await repo.tree(ctxA, projectA, { deleted: true })).map(r => r.id)).toEqual([root.id, child.id]);
      expect(await repo.tree(ctxB, projectA, { deleted: true })).toEqual([]);
      expect((await repo.deletedTogether(ctxA, projectA, at)).map(r => r.id)).toEqual([root.id, child.id]);
      expect(await repo.deletedTogether(ctxB, projectA, at)).toEqual([]);
    });
  });

  test('comment, attachment and watcher counts read only the organisation’s rows', async () => {
    await inRolledBackTx(async tx => {
      const repo = articlesRepository(tx);
      const { ctxA, ctxB, alice, projectA } = await seedIssueWorld(tx);
      const a = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const comments = commentsRepository(tx);
      await comments.insert(ctxA, { article_id: a.id, author_id: alice, body_md: 'one', created_at: new Date() });
      const gone = await comments.insert(ctxA, {
        article_id: a.id,
        author_id: alice,
        body_md: 'two',
        created_at: new Date(),
      });
      await comments.update(ctxA, gone.id, { deleted_at: new Date() });
      const attachments = attachmentsRepository(tx);
      await attachments.insert(ctxA, file(alice, a.id));
      await attachments.insert(ctxA, { ...file(alice, a.id), completed_at: null });
      await repo.watch(ctxA, a.id, [alice], 'explicit');

      expect(await repo.commentCounts(ctxA, [a.id, a.id])).toEqual(new Map([[a.id, 1]]));
      expect(await repo.commentCounts(ctxB, [a.id])).toEqual(new Map());
      expect(await repo.attachmentCounts(ctxA, [a.id])).toEqual(new Map([[a.id, 1]]));
      expect(await repo.attachmentCounts(ctxB, [a.id])).toEqual(new Map());
      expect(await repo.watcherCounts(ctxA, [a.id])).toEqual(new Map([[a.id, 1]]));
      expect(await repo.watcherCounts(ctxB, [a.id])).toEqual(new Map());
      expect(await repo.commentCounts(ctxA, [])).toEqual(new Map());
    });
  });

  test('tags apply, list and remove only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = articlesRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const a = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const b = await insertArticle(tx, ctxB, { project_id: projectB, created_by: bob, title: 'Guide' });
      const tagA = await tagIn(tx, ctxA, alice, 'runbook');
      const tagB = await tagIn(tx, ctxB, bob, 'runbook');

      expect(await repo.applyTags(ctxA, a.id, [tagA.id])).toEqual([tagA.id]);
      expect(await repo.applyTags(ctxA, a.id, [tagA.id])).toEqual([]);
      expect(await failsInSavepoint(tx, sp => articlesRepository(sp).applyTags(ctxA, a.id, [tagB.id]))).toBe(true);
      expect(await failsInSavepoint(tx, sp => articlesRepository(sp).applyTags(ctxB, a.id, [tagB.id]))).toBe(true);
      await repo.applyTags(ctxB, b.id, [tagB.id]);

      expect((await repo.tagsFor(ctxA, [a.id, b.id])).map(r => [r.article_id, r.tag.id])).toEqual([[a.id, tagA.id]]);
      expect((await repo.tagsFor(ctxB, [a.id, b.id])).map(r => [r.article_id, r.tag.id])).toEqual([[b.id, tagB.id]]);
      expect(await repo.removeTag(ctxB, a.id, tagA.id)).toBe(false);
      expect(await repo.removeTag(ctxA, a.id, tagA.id)).toBe(true);
      expect(await repo.tagsFor(ctxA, [a.id])).toEqual([]);
    });
  });

  test('stars and watches are written and read only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = articlesRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA } = await seedIssueWorld(tx);
      const a = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const sourceOf = async (userId: number) => {
        const [row] = await tx
          .select({ source: schema.article_watchers.source })
          .from(schema.article_watchers)
          .where(and(eq(schema.article_watchers.article_id, a.id), eq(schema.article_watchers.user_id, userId)));
        return row?.source;
      };

      expect(await failsInSavepoint(tx, sp => articlesRepository(sp).star(ctxB, a.id, bob))).toBe(true);
      expect(await failsInSavepoint(tx, sp => articlesRepository(sp).watch(ctxB, a.id, [bob], 'explicit'))).toBe(true);
      await repo.star(ctxA, a.id, alice);
      await repo.star(ctxA, a.id, alice);
      await repo.watch(ctxA, a.id, [alice], 'auto');

      expect(await repo.signalsFor(ctxA, [a.id], alice)).toEqual(new Map([[a.id, { starred: true, watching: true }]]));
      expect(await repo.signalsFor(ctxB, [a.id], alice)).toEqual(
        new Map([[a.id, { starred: false, watching: false }]]),
      );
      expect(await repo.starredIn(ctxA, projectA, alice)).toEqual(new Set([a.id]));
      expect(await repo.starredIn(ctxB, projectA, alice)).toEqual(new Set());

      await repo.watch(ctxA, a.id, [alice], 'explicit');
      expect(await sourceOf(alice)).toBe('explicit');
      await repo.watch(ctxA, a.id, [alice], 'auto');
      expect(await sourceOf(alice)).toBe('explicit');

      await repo.unstar(ctxB, a.id, alice);
      await repo.unwatch(ctxB, a.id, alice);
      expect(await repo.signalsFor(ctxA, [a.id], alice)).toEqual(new Map([[a.id, { starred: true, watching: true }]]));
      await repo.unstar(ctxA, a.id, alice);
      await repo.unwatch(ctxA, a.id, alice);
      expect(await repo.signalsFor(ctxA, [a.id], alice)).toEqual(
        new Map([[a.id, { starred: false, watching: false }]]),
      );
    });
  });

  test('mentions and issue references are replaced and read only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = articlesRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const a = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const b = await insertArticle(tx, ctxB, { project_id: projectB, created_by: bob, title: 'Guide' });
      const gone = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Old' });
      const mentionsOf = (articleId: number) =>
        tx
          .select({ user: schema.mentions.mentioned_user_id })
          .from(schema.mentions)
          .where(eq(schema.mentions.article_id, articleId));

      const source = { type: 'article' as const, id: a.id, articleId: a.id };
      await repo.replaceMentions(ctxA, source, [alice, alice]);
      expect(await failsInSavepoint(tx, sp => articlesRepository(sp).replaceMentions(ctxB, source, [bob]))).toBe(true);
      await repo.replaceMentions(ctxB, { type: 'article', id: a.id, articleId: b.id }, []);
      expect(await mentionsOf(a.id)).toEqual([{ user: alice }]);
      expect(await repo.mentionsOf(ctxA, { type: 'article', id: a.id })).toEqual([
        expect.objectContaining({ mentioned_user_id: alice, article_id: a.id, issue_id: null }),
      ]);
      expect(await repo.mentionsOf(ctxB, { type: 'article', id: a.id })).toEqual([]);
      await repo.replaceMentions(ctxA, source, []);
      expect(await mentionsOf(a.id)).toEqual([]);

      await repo.replaceIssueRefs(ctxA, a.id, ['AC-1', 'AC-1']);
      await repo.replaceIssueRefs(ctxA, gone.id, ['AC-1']);
      await repo.update(ctxA, gone.id, { deleted_at: new Date() });
      await repo.replaceIssueRefs(ctxB, b.id, ['AC-1']);
      expect(await failsInSavepoint(tx, sp => articlesRepository(sp).replaceIssueRefs(ctxB, a.id, ['AC-2']))).toBe(
        true,
      );
      await repo.replaceIssueRefs(ctxB, a.id, []);
      expect((await repo.referencing(ctxA, 'AC-1')).map(r => r.id)).toEqual([a.id]);
      expect((await repo.referencing(ctxB, 'AC-1')).map(r => r.id)).toEqual([b.id]);
      await repo.replaceIssueRefs(ctxA, a.id, ['AC-2']);
      expect(await repo.referencing(ctxA, 'AC-1')).toEqual([]);
      expect((await repo.referencing(ctxA, 'AC-2')).map(r => r.id)).toEqual([a.id]);
    });
  });

  test('the purge removes only the organisation’s expired articles and their dependants', async () => {
    await inRolledBackTx(async tx => {
      const repo = articlesRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const old = new Date('2026-01-01T00:00:00Z');
      const cutoff = new Date('2026-02-01T00:00:00Z');
      const doomed = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Doomed' });
      const orphan = await insertArticle(tx, ctxA, {
        project_id: projectA,
        created_by: alice,
        title: 'Orphan',
        parent_id: doomed.id,
      });
      const keptB = await insertArticle(tx, ctxB, { project_id: projectB, created_by: bob, title: 'Doomed' });
      const tag = await tagIn(tx, ctxA, alice, 'runbook');
      await repo.applyTags(ctxA, doomed.id, [tag.id]);
      await repo.star(ctxA, doomed.id, alice);
      await repo.watch(ctxA, doomed.id, [alice], 'explicit');
      await repo.replaceIssueRefs(ctxA, doomed.id, ['AC-1']);
      await repo.replaceMentions(ctxA, { type: 'article', id: doomed.id, articleId: doomed.id }, [alice]);
      const comment = await commentsRepository(tx).insert(ctxA, {
        article_id: doomed.id,
        author_id: alice,
        body_md: 'x',
        created_at: new Date(),
      });
      const attachment = await attachmentsRepository(tx).insert(ctxA, file(alice, doomed.id));
      await repo.update(ctxA, doomed.id, { deleted_at: old });
      await repo.update(ctxA, orphan.id, { deleted_at: new Date() });
      await repo.update(ctxB, keptB.id, { deleted_at: old });

      const orgs = await repo.orgsWithDeletedBefore(sys, cutoff);
      expect(orgs).toContain(ctxA.orgId);
      expect(orgs).toContain(ctxB.orgId);

      expect(await repo.purgeDeletedBefore(ctxA, cutoff)).toBe(1);
      expect(await repo.findById(ctxA, doomed.id)).toBeUndefined();
      expect((await repo.findById(ctxA, orphan.id))?.parent_id).toBeNull();
      expect((await repo.findById(ctxB, keptB.id))?.id).toBe(keptB.id);
      expect(await repo.tagsFor(ctxA, [doomed.id])).toEqual([]);
      expect(await repo.signalsFor(ctxA, [doomed.id], alice)).toEqual(
        new Map([[doomed.id, { starred: false, watching: false }]]),
      );
      expect(await repo.referencing(ctxA, 'AC-1')).toEqual([]);
      expect(await commentsRepository(tx).findLive(ctxA, [comment.id])).toEqual([]);
      expect(await attachmentsRepository(tx).findByPublicId(ctxA, attachment.public_id)).toBeUndefined();
      const leftovers = await tx.select().from(schema.mentions).where(eq(schema.mentions.article_id, doomed.id));
      expect(leftovers).toEqual([]);

      const afterA = await repo.orgsWithDeletedBefore(sys, cutoff);
      expect(afterA).not.toContain(ctxA.orgId);
      expect(afterA).toContain(ctxB.orgId);
    });
  });
});
