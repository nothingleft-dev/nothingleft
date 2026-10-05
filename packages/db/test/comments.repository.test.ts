import { describe, expect, test } from 'bun:test';
import { commentsRepository } from '../src/repositories/comments.repository.ts';
import { issueActivityRepository } from '../src/repositories/issue-activity.repository.ts';
import { failsInSavepoint, inRolledBackTx, insertArticle, seedIssueWorld } from './fixtures.ts';

describe('commentsRepository tenant isolation', () => {
  test('insert refuses another organisation’s issue', async () => {
    await inRolledBackTx(async tx => {
      const repo = commentsRepository(tx);
      const { ctxB, bob, issueA } = await seedIssueWorld(tx);
      const attempt = repo.insert(ctxB, { issue_id: issueA.id, author_id: bob, body_md: 'x', created_at: new Date() });
      await expect(attempt).rejects.toThrow();
    });
  });

  test('find, lock, list, count, findLive and update answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = commentsRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const first = await repo.insert(ctxA, {
        issue_id: issueA.id,
        author_id: alice,
        body_md: 'one',
        created_at: new Date(),
      });
      const second = await repo.insert(ctxA, {
        issue_id: issueA.id,
        author_id: alice,
        body_md: 'two',
        created_at: new Date(),
      });

      expect((await repo.findOnIssue(ctxA, issueA.id, first.id))?.author.id).toBe(alice);
      expect(await repo.findOnIssue(ctxB, issueA.id, first.id)).toBeUndefined();
      expect(await repo.lockOnIssue(ctxB, issueA.id, first.id)).toBeUndefined();
      expect((await repo.list(ctxA, issueA.id, { limit: 10 })).map(r => r.comment.id)).toEqual([first.id, second.id]);
      expect((await repo.list(ctxA, issueA.id, { afterId: first.id, limit: 10 })).map(r => r.comment.id)).toEqual([
        second.id,
      ]);
      expect(await repo.list(ctxB, issueA.id, { limit: 10 })).toEqual([]);
      expect(await repo.count(ctxB, issueA.id)).toBe(0);
      expect(await repo.findLive(ctxB, [first.id])).toEqual([]);
      expect(await repo.update(ctxB, first.id, { body_md: 'hijacked' })).toBeUndefined();

      await repo.update(ctxA, first.id, { deleted_at: new Date() });
      expect(await repo.count(ctxA, issueA.id)).toBe(1);
      expect(await repo.findOnIssue(ctxA, issueA.id, first.id)).toBeUndefined();
      expect((await repo.findLive(ctxA, [first.id, second.id])).map(r => r.comment.id)).toEqual([second.id]);
    });
  });

  test('activity entries of a deleted comment vanish; comment_deleted and the kind filter stay', async () => {
    await inRolledBackTx(async tx => {
      const repo = commentsRepository(tx);
      const activity = issueActivityRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const c = await repo.insert(ctxA, {
        issue_id: issueA.id,
        author_id: alice,
        body_md: 'x',
        created_at: new Date(),
      });
      const entry = (kind: 'commented' | 'comment_edited' | 'comment_deleted') =>
        activity.record(ctxA, {
          issue_id: issueA.id,
          actor_id: alice,
          change_group_id: Bun.randomUUIDv7(),
          kind,
          new_value: { comment_id: c.id },
        });
      await entry('commented');
      await entry('comment_edited');
      expect(await activity.count(ctxA, issueA.id)).toBe(2);
      expect(await activity.count(ctxA, issueA.id, { kinds: ['comment_edited'] })).toBe(1);
      expect(await activity.count(ctxB, issueA.id)).toBe(0);

      await repo.update(ctxA, c.id, { deleted_at: new Date() });
      await entry('comment_deleted');
      const kinds = (await activity.list(ctxA, issueA.id, { limit: 10 })).map(r => r.activity.kind);
      expect(kinds).toEqual(['comment_deleted']);
    });
  });
});

describe('commentsRepository removal counts', () => {
  test('countByAuthor counts live comments in one organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = commentsRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      await repo.insert(ctxA, { issue_id: issueA.id, author_id: alice, body_md: 'one', created_at: new Date() });
      const gone = await repo.insert(ctxA, {
        issue_id: issueA.id,
        author_id: alice,
        body_md: 'two',
        created_at: new Date(),
      });
      await repo.update(ctxA, gone.id, { deleted_at: new Date() });
      expect(await repo.countByAuthor(ctxA, alice)).toBe(1);
      expect(await repo.countByAuthor(ctxB, alice)).toBe(0);
    });
  });
});

describe('commentsRepository on articles', () => {
  test('insert refuses another organisation’s article', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, alice, bob, projectA } = await seedIssueWorld(tx);
      const article = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const attempt = (sp: typeof tx) =>
        commentsRepository(sp).insert(ctxB, {
          article_id: article.id,
          author_id: bob,
          body_md: 'x',
          created_at: new Date(),
        });
      expect(await failsInSavepoint(tx, attempt)).toBe(true);
    });
  });

  test('find, lock, list and count on an article answer only within the organisation and that parent', async () => {
    await inRolledBackTx(async tx => {
      const repo = commentsRepository(tx);
      const { ctxA, ctxB, alice, projectA, issueA } = await seedIssueWorld(tx);
      const article = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const first = await repo.insert(ctxA, {
        article_id: article.id,
        author_id: alice,
        body_md: 'one',
        created_at: new Date(),
      });
      const second = await repo.insert(ctxA, {
        article_id: article.id,
        author_id: alice,
        body_md: 'two',
        created_at: new Date(),
      });
      const onIssue = await repo.insert(ctxA, {
        issue_id: issueA.id,
        author_id: alice,
        body_md: 'elsewhere',
        created_at: new Date(),
      });

      expect(first.article_id).toBe(article.id);
      expect(first.issue_id).toBeNull();
      expect((await repo.findOnArticle(ctxA, article.id, first.id))?.author.id).toBe(alice);
      expect(await repo.findOnArticle(ctxB, article.id, first.id)).toBeUndefined();
      expect(await repo.findOnArticle(ctxA, article.id, onIssue.id)).toBeUndefined();
      expect(await repo.findOnIssue(ctxA, issueA.id, first.id)).toBeUndefined();
      expect((await repo.lockOnArticle(ctxA, article.id, first.id))?.id).toBe(first.id);
      expect(await repo.lockOnArticle(ctxB, article.id, first.id)).toBeUndefined();
      expect(await repo.lockOnArticle(ctxA, article.id, onIssue.id)).toBeUndefined();

      expect((await repo.listOnArticle(ctxA, article.id, { limit: 10 })).map(r => r.comment.id)).toEqual([
        first.id,
        second.id,
      ]);
      expect(
        (await repo.listOnArticle(ctxA, article.id, { afterId: first.id, limit: 10 })).map(r => r.comment.id),
      ).toEqual([second.id]);
      expect(await repo.listOnArticle(ctxB, article.id, { limit: 10 })).toEqual([]);
      expect(await repo.countOnArticle(ctxA, article.id)).toBe(2);
      expect(await repo.countOnArticle(ctxB, article.id)).toBe(0);
      expect(await repo.count(ctxA, issueA.id)).toBe(1);

      await repo.update(ctxA, first.id, { deleted_at: new Date() });
      expect(await repo.countOnArticle(ctxA, article.id)).toBe(1);
      expect(await repo.findOnArticle(ctxA, article.id, first.id)).toBeUndefined();
      expect(await repo.lockOnArticle(ctxA, article.id, first.id)).toBeUndefined();
    });
  });
});
