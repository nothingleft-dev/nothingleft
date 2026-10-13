import { describe, expect, test } from 'bun:test';
import { attachmentsRepository, type AttachmentInsert } from '../src/repositories/attachments.repository.ts';
import { commentsRepository } from '../src/repositories/comments.repository.ts';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { workItemsRepository } from '../src/repositories/work-items.repository.ts';
import { articlesRepository } from '../src/repositories/articles.repository.ts';
import { failsInSavepoint, inRolledBackTx, insertArticle, seedIssueWorld, sys } from './fixtures.ts';

const file = (userId: number, over: Partial<AttachmentInsert> = {}): AttachmentInsert => ({
  public_id: crypto.randomUUID(),
  issue_id: null,
  filename: 'login-bug.png',
  mime_type: 'image/png',
  size_bytes: 1000,
  checksum: Buffer.alloc(32),
  storage_target: 'platform',
  bucket: 'nl-private',
  object_key: 'api/x',
  created_by: userId,
  ...over,
});

describe('attachmentsRepository tenant isolation', () => {
  test('insert refuses another organisation’s issue', async () => {
    await inRolledBackTx(async tx => {
      const { ctxB, bob, issueA, issueB } = await seedIssueWorld(tx);
      const repo = attachmentsRepository(tx);
      expect(
        await failsInSavepoint(tx, sp => attachmentsRepository(sp).insert(ctxB, file(bob, { issue_id: issueA.id }))),
      ).toBe(true);
      expect((await repo.insert(ctxB, file(bob, { issue_id: issueB.id }))).org_id).toBe(ctxB.orgId);
    });
  });

  test('reads, locks, completes and deletes answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const { ctxA, ctxB, alice, bob, issueA, issueB } = await seedIssueWorld(tx);
      const a = await repo.insert(ctxA, file(alice, { issue_id: issueA.id }));
      await repo.insert(ctxB, file(bob, { issue_id: issueB.id, size_bytes: 7 }));

      expect((await repo.findByPublicId(ctxA, a.public_id))?.id).toBe(a.id);
      expect(await repo.findByPublicId(ctxB, a.public_id)).toBeUndefined();
      expect(await repo.lockByPublicId(ctxB, a.public_id)).toBeUndefined();
      expect(await repo.orgOfPublicId(sys, a.public_id)).toBe(ctxA.orgId);

      expect(await repo.reservedBytes(ctxA)).toBe(1000);
      expect(await repo.reservedBytes(ctxB)).toBe(7);
      expect(await repo.countOnIssue(ctxA, issueA.id)).toBe(1);
      expect(await repo.countOnIssue(ctxB, issueA.id)).toBe(0);
      expect(await repo.listOnIssue(ctxA, issueA.id)).toEqual([]);

      expect(await repo.complete(ctxB, a.id, new Date())).toBeUndefined();
      expect((await repo.complete(ctxA, a.id, new Date()))?.completed_at).not.toBeNull();
      expect(await repo.complete(ctxA, a.id, new Date())).toBeUndefined();
      expect(await repo.reservedBytes(ctxA)).toBe(0);
      expect((await repo.listOnIssue(ctxA, issueA.id)).map(r => r.id)).toEqual([a.id]);
      expect(await repo.listOnIssue(ctxB, issueA.id)).toEqual([]);
      expect((await repo.readyCounts(ctxA, [issueA.id])).get(issueA.id)).toBe(1);
      expect((await repo.readyCounts(ctxB, [issueA.id])).size).toBe(0);

      expect(await repo.softDelete(ctxB, [a.id], new Date())).toEqual([]);
      expect(await repo.softDelete(ctxA, [a.id], new Date())).toHaveLength(1);
      expect(await repo.softDelete(ctxA, [a.id], new Date())).toEqual([]);
      expect(await repo.hardDelete(ctxB, [a.id])).toBe(0);
      expect(await repo.hardDelete(ctxA, [a.id])).toBe(1);
    });
  });

  test('drafts are found and claimed only by their uploader, in their organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const { ctxA, ctxB, alice, bob, issueA } = await seedIssueWorld(tx);
      const draft = await repo.insert(ctxA, file(alice));

      expect(await repo.findDrafts(ctxA, [draft.public_id], bob)).toEqual([]);
      expect(await repo.findDrafts(ctxB, [draft.public_id], alice)).toEqual([]);
      expect((await repo.findDrafts(ctxA, [draft.public_id], alice)).map(r => r.id)).toEqual([draft.id]);

      expect(await repo.claim(ctxB, [draft.id], { issue_id: issueA.id })).toEqual([]);
      const [claimed] = await repo.claim(ctxA, [draft.id], { issue_id: issueA.id });
      expect(claimed?.issue_id).toBe(issueA.id);
      expect(await repo.claim(ctxA, [draft.id], { issue_id: issueA.id })).toEqual([]);
    });
  });

  test('comment and work-item releases touch only the organisation’s rows', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const comment = await commentsRepository(tx).insert(ctxA, {
        issue_id: issueA.id,
        author_id: alice,
        body_md: 'see',
        created_at: new Date(),
      });
      const [item] = await workItemsRepository(tx).insertMany(ctxA, [
        {
          issue_id: issueA.id,
          author_id: alice,
          created_by: alice,
          work_date: '2026-09-21',
          duration_minutes: 30,
          description_md: '',
        },
      ]);
      await repo.insert(ctxA, file(alice, { issue_id: issueA.id, comment_id: comment.id }));
      await repo.insert(ctxA, file(alice, { issue_id: issueA.id, work_item_id: item!.id }));

      expect(await repo.softDeleteForComment(ctxB, comment.id, new Date())).toEqual([]);
      expect(await repo.softDeleteForComment(ctxA, comment.id, new Date())).toHaveLength(1);
      expect(await repo.detachFromWorkItems(ctxB, [item!.id], new Date())).toEqual([]);
      expect(await repo.detachFromWorkItems(ctxA, [item!.id], new Date())).toHaveLength(1);
      await workItemsRepository(tx).delete(ctxA, item!.id);
      expect(await repo.countOnIssue(ctxA, issueA.id)).toBe(0);
    });
  });

  test('inline references read only the organisation’s issue and live comments', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const inDescription = crypto.randomUUID();
      const inComment = crypto.randomUUID();
      const inDeletedComment = crypto.randomUUID();
      await issuesRepository(tx).update(ctxA, issueA.id, { description_md: `![x](https://f/${inDescription}/x.png)` });
      const comments = commentsRepository(tx);
      await comments.insert(ctxA, {
        issue_id: issueA.id,
        author_id: alice,
        body_md: inComment,
        created_at: new Date(),
      });
      const gone = await comments.insert(ctxA, {
        issue_id: issueA.id,
        author_id: alice,
        body_md: inDeletedComment,
        created_at: new Date(),
      });
      await comments.update(ctxA, gone.id, { deleted_at: new Date() });

      const ids = [inDescription, inComment, inDeletedComment, crypto.randomUUID()];
      expect(await repo.referencedOnIssue(ctxA, issueA.id, ids)).toEqual([inDescription, inComment]);
      expect(await repo.referencedOnIssue(ctxB, issueA.id, ids)).toEqual([]);
    });
  });

  test('the purge listing and the sweep see what they should', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const old = new Date('2026-01-01T00:00:00Z');
      const abandoned = await repo.insert(ctxA, file(alice, { issue_id: issueA.id, created_at: old }));
      const staleDraft = await repo.insert(ctxA, file(alice, { created_at: old, completed_at: old }));
      const fresh = await repo.insert(ctxA, file(alice, { completed_at: new Date() }));
      await issuesRepository(tx).update(ctxA, issueA.id, { deleted_at: old });

      const cutoff = new Date('2026-02-01T00:00:00Z');
      expect((await repo.onIssuesDeletedBefore(ctxA, cutoff, [issueA.id])).map(r => r.id)).toEqual([abandoned.id]);
      expect(await repo.onIssuesDeletedBefore(ctxA, cutoff, [])).toEqual([]);
      expect(await repo.onIssuesDeletedBefore(ctxB, cutoff, [issueA.id])).toEqual([]);

      const expired = await repo.expired(sys, { pendingBefore: cutoff, draftBefore: cutoff, limit: 1000 });
      const mine = expired.filter(r => r.org_id === ctxA.orgId).map(r => r.id);
      expect(mine).toContain(abandoned.id);
      expect(mine).toContain(staleDraft.id);
      expect(mine).not.toContain(fresh.id);
    });
  });
});

describe('organizationsRepository storage accounting', () => {
  test('usage, notice level and the admin list stay within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { ctxA, ctxB, alice } = await seedIssueWorld(tx);
      expect((await orgs.lockById(ctxA))?.id).toBe(ctxA.orgId);
      const before = (await orgs.findById(ctxB))!.storage_used_bytes;
      expect(await orgs.adjustStorageUsed(ctxA, 500)).toBe(500);
      expect(await orgs.adjustStorageUsed(ctxA, -900)).toBe(0);
      expect((await orgs.findById(ctxB))!.storage_used_bytes).toBe(before);

      await orgs.setStorageNoticeLevel(ctxA, 95);
      expect((await orgs.findById(ctxA))!.storage_notice_level).toBe(95);
      expect((await orgs.findById(ctxB))!.storage_notice_level).toBe(0);

      const admins = await orgs.listAdmins(ctxA);
      expect(admins.map(a => a.user.id)).toEqual([alice]);
      expect((await orgs.listAdmins(ctxB)).some(a => a.user.id === alice)).toBe(false);
    });
  });
});

describe('attachmentsRepository on articles', () => {
  test('insert refuses another organisation’s article', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, alice, bob, projectA } = await seedIssueWorld(tx);
      const article = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      expect(
        await failsInSavepoint(tx, sp => attachmentsRepository(sp).insert(ctxB, file(bob, { article_id: article.id }))),
      ).toBe(true);
    });
  });

  test('list and count on an article answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const { ctxA, ctxB, alice, projectA } = await seedIssueWorld(tx);
      const article = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const comment = await commentsRepository(tx).insert(ctxA, {
        article_id: article.id,
        author_id: alice,
        body_md: 'see',
        created_at: new Date(),
      });
      const ready = await repo.insert(ctxA, file(alice, { article_id: article.id, completed_at: new Date() }));
      const onComment = await repo.insert(
        ctxA,
        file(alice, { article_id: article.id, comment_id: comment.id, completed_at: new Date() }),
      );
      await repo.insert(ctxA, file(alice, { article_id: article.id }));

      expect((await repo.listOnArticle(ctxA, article.id)).map(r => r.id)).toEqual([ready.id, onComment.id]);
      expect((await repo.listOnArticle(ctxA, article.id, { commentId: comment.id })).map(r => r.id)).toEqual([
        onComment.id,
      ]);
      expect(await repo.listOnArticle(ctxB, article.id)).toEqual([]);
      expect(await repo.countOnArticle(ctxA, article.id)).toBe(3);
      expect(await repo.countOnArticle(ctxB, article.id)).toBe(0);
      await repo.softDelete(ctxA, [ready.id], new Date());
      expect(await repo.countOnArticle(ctxA, article.id)).toBe(2);
    });
  });

  test('inline references read only the organisation’s article body and live comments', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const { ctxA, ctxB, alice, projectA } = await seedIssueWorld(tx);
      const inBody = crypto.randomUUID();
      const inComment = crypto.randomUUID();
      const inDeletedComment = crypto.randomUUID();
      const article = await insertArticle(tx, ctxA, {
        project_id: projectA,
        created_by: alice,
        title: 'Guide',
        body_md: `![x](https://f/${inBody}/x.png)`,
      });
      const comments = commentsRepository(tx);
      await comments.insert(ctxA, {
        article_id: article.id,
        author_id: alice,
        body_md: inComment,
        created_at: new Date(),
      });
      const gone = await comments.insert(ctxA, {
        article_id: article.id,
        author_id: alice,
        body_md: inDeletedComment,
        created_at: new Date(),
      });
      await comments.update(ctxA, gone.id, { deleted_at: new Date() });

      const ids = [inBody, inComment, inDeletedComment, crypto.randomUUID()];
      expect(await repo.referencedOnArticle(ctxA, article.id, ids)).toEqual([inBody, inComment]);
      expect(await repo.referencedOnArticle(ctxB, article.id, ids)).toEqual([]);
      expect(await repo.referencedOnArticle(ctxA, article.id, [])).toEqual([]);
    });
  });

  test('drafts claimed onto an article stop being drafts, in their organisation only', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const article = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const articleB = await insertArticle(tx, ctxB, { project_id: projectB, created_by: bob, title: 'Guide' });
      const old = new Date('2026-01-01T00:00:00Z');
      const draft = await repo.insert(ctxA, file(alice, { created_at: old, completed_at: old }));

      expect(await repo.claim(ctxB, [draft.id], { article_id: articleB.id })).toEqual([]);
      expect(
        await failsInSavepoint(tx, sp =>
          attachmentsRepository(sp).claim(ctxA, [draft.id], { article_id: articleB.id }),
        ),
      ).toBe(true);
      const [claimed] = await repo.claim(ctxA, [draft.id], { article_id: article.id });
      expect(claimed?.article_id).toBe(article.id);
      expect(claimed?.issue_id).toBeNull();
      expect(await repo.claim(ctxA, [draft.id], { article_id: article.id })).toEqual([]);
      expect(await repo.findDrafts(ctxA, [draft.public_id], alice)).toEqual([]);

      const cutoff = new Date('2026-02-01T00:00:00Z');
      const expired = await repo.expired(sys, { pendingBefore: cutoff, draftBefore: cutoff, limit: 1000 });
      expect(expired.map(r => r.id)).not.toContain(draft.id);
    });
  });

  test('the purge listing sees only the organisation’s expired articles', async () => {
    await inRolledBackTx(async tx => {
      const repo = attachmentsRepository(tx);
      const articles = articlesRepository(tx);
      const { ctxA, ctxB, alice, projectA } = await seedIssueWorld(tx);
      const old = new Date('2026-01-01T00:00:00Z');
      const cutoff = new Date('2026-02-01T00:00:00Z');
      const doomed = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Doomed' });
      const recent = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Recent' });
      const live = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Live' });
      const pending = await repo.insert(ctxA, file(alice, { article_id: doomed.id }));
      await repo.insert(ctxA, file(alice, { article_id: recent.id, completed_at: new Date() }));
      await repo.insert(ctxA, file(alice, { article_id: live.id, completed_at: new Date() }));
      await articles.update(ctxA, doomed.id, { deleted_at: old });
      await articles.update(ctxA, recent.id, { deleted_at: new Date() });

      const ids = [doomed.id, recent.id, live.id];
      expect((await repo.onArticlesDeletedBefore(ctxA, cutoff, ids)).map(r => r.id)).toEqual([pending.id]);
      expect(await repo.onArticlesDeletedBefore(ctxA, cutoff, [])).toEqual([]);
      expect(await repo.onArticlesDeletedBefore(ctxB, cutoff, ids)).toEqual([]);
    });
  });
});
