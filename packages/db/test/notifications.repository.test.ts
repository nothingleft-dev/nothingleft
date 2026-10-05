import { describe, expect, test } from 'bun:test';
import {
  notificationsRepository,
  type InboxOrg,
  type InboxScope,
} from '../src/repositories/notifications.repository.ts';
import { issueActivityRepository } from '../src/repositories/issue-activity.repository.ts';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { usersRepository } from '../src/repositories/users.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { articlesRepository } from '../src/repositories/articles.repository.ts';
import { commentsRepository } from '../src/repositories/comments.repository.ts';
import { inRolledBackTx, insertArticle, seedIssueWorld, sys, type IssueWorld } from './fixtures.ts';
import type { Queryable } from '../src/client.ts';

const row = (w: IssueWorld, userId: number, dedupe: string, over: Record<string, unknown> = {}) => ({
  user_id: userId,
  kind: 'assigned',
  project_id: w.projectA,
  issue_id: w.issueA.id,
  actor_id: w.alice,
  payload: {},
  dedupe_key: dedupe,
  ...over,
});

type DraftLists = Partial<Pick<InboxOrg, 'ownDraftProjectIds' | 'adminProjectIds'>>;

const scopeA = (w: IssueWorld, userId = w.alice, lists: DraftLists = {}): InboxScope => ({
  userId,
  orgs: [{ ctx: w.ctxA, projectIds: [w.projectA], ownDraftProjectIds: [w.projectA], adminProjectIds: [], ...lists }],
});

async function carol(tx: Queryable, w: IssueWorld) {
  const user = await usersRepository(tx).create(sys, {
    email: `carol-${Date.now()}-${Math.random()}@test.local`,
    name: 'Carol',
  });
  await organizationsRepository(tx).addMember(w.ctxA, {
    user_id: user.id,
    username: `carol${user.id}`,
    role: 'member',
  });
  return user.id;
}

describe('notificationsRepository tenant isolation', () => {
  test('insertMany files rows under the context organisation and skips a repeated dedupe key', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      const [first] = await repo.insertMany(w.ctxA, [row(w, w.alice, 'a:1')]);
      expect(first!.org_id).toBe(w.orgA);
      expect(await repo.insertMany(w.ctxA, [row(w, w.alice, 'a:1')])).toEqual([]);
      // The composite keys make an ORG A issue unwritable under ORG B.
      await expect(repo.insertMany(w.ctxB, [row(w, w.alice, 'a:2')])).rejects.toThrow();
    });
  });

  test('groups, lists and counts only the scope organisation and readable projects', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      await repo.insertMany(w.ctxA, [row(w, w.alice, 'a:1'), row(w, w.alice, 'a:2', { kind: 'commented' })]);
      await repo.insertMany(w.ctxB, [
        row(w, w.alice, 'b:1', { project_id: w.projectB, issue_id: w.issueB.id, actor_id: w.bob }),
      ]);

      const groups = await repo.listGroups(scopeA(w), {}, { limit: 10 });
      expect(groups.total).toBe(1);
      expect(groups.groups[0]).toMatchObject({ count: 2, unread_count: 2, group_key: `i${w.issueA.id}` });
      expect(groups.groups[0]!.kinds.sort()).toEqual(['assigned', 'commented']);

      const views = await repo.listInGroups(scopeA(w), {}, [`i${w.issueA.id}`, `i${w.issueB.id}`], 10);
      expect(views.map(v => v.organization.id)).toEqual([w.orgA, w.orgA]);
      expect(views[0]!.project.key).toBe('AC');
      expect(views[0]!.issue?.key_number).toBe(w.issueA.key_number);

      const list = await repo.list(scopeA(w), { issueId: w.issueB.id }, { limit: 10 });
      expect(list.rows).toEqual([]);
      expect((await repo.unreadGroupsByOrg(scopeA(w))).get(w.orgA)).toBe(1);
      expect((await repo.unreadGroupsByOrg(scopeA(w))).has(w.orgB)).toBe(false);
      expect(await repo.projectsInInbox(scopeA(w))).toEqual([
        { org_id: w.orgA, project_id: w.projectA, key: 'AC', name: 'Acme' },
      ]);
      // A project the reader cannot open hides its rows.
      expect(
        await repo.countGroups(
          { userId: w.alice, orgs: [{ ctx: w.ctxA, projectIds: [], ownDraftProjectIds: [], adminProjectIds: [] }] },
          {},
        ),
      ).toBe(0);
    });
  });

  test('a trashed issue and someone else’s draft article are hidden', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      const other = await carol(tx, w);
      const draft = await insertArticle(tx, w.ctxA, {
        project_id: w.projectA,
        created_by: other,
        title: 'Draft',
        status: 'draft',
      });
      await repo.insertMany(w.ctxA, [
        row(w, w.alice, 'a:1'),
        row(w, w.alice, 'a:2', { kind: 'article_updated', issue_id: null, article_id: draft.id }),
      ]);
      expect(await repo.countGroups(scopeA(w), {})).toBe(1);
      await issuesRepository(tx).update(w.ctxA, w.issueA.id, { deleted_at: new Date() });
      expect(await repo.countGroups(scopeA(w), {})).toBe(0);
    });
  });

  test('an article entry follows the reader’s draft reach, only inside the scope organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      const other = await carol(tx, w);
      const draft = (ctx: typeof w.ctxA, project_id: number, created_by: number, title: string) =>
        insertArticle(tx, ctx, { project_id, created_by, title, status: 'draft' });
      const theirs = await draft(w.ctxA, w.projectA, other, 'Theirs');
      const mine = await draft(w.ctxA, w.projectA, w.alice, 'Mine');
      const elsewhere = await draft(w.ctxB, w.projectB, w.alice, 'Elsewhere');
      const onArticle = (id: number) => ({ kind: 'article_updated', issue_id: null, article_id: id });
      await repo.insertMany(w.ctxA, [
        row(w, w.alice, 'a:theirs', onArticle(theirs.id)),
        row(w, w.alice, 'a:mine', onArticle(mine.id)),
      ]);
      await repo.insertMany(w.ctxB, [
        row(w, w.alice, 'b:elsewhere', { ...onArticle(elsewhere.id), project_id: w.projectB, actor_id: w.bob }),
      ]);
      const keys = async (scope: InboxScope) =>
        (await repo.listGroups(scope, {}, { limit: 10 })).groups.map(g => g.group_key).sort();
      const both = [`a${mine.id}`, `a${theirs.id}`].sort();

      expect(await keys(scopeA(w))).toEqual([`a${mine.id}`]);
      expect(await keys(scopeA(w, w.alice, { ownDraftProjectIds: [] }))).toEqual([]);
      expect(await keys(scopeA(w, w.alice, { adminProjectIds: [w.projectA] }))).toEqual(both);
      const both2 = (b: Partial<InboxOrg>): InboxScope => ({
        userId: w.alice,
        orgs: [
          {
            ctx: w.ctxA,
            projectIds: [w.projectA],
            ownDraftProjectIds: [w.projectA, w.projectB],
            adminProjectIds: [w.projectB],
          },
          { ctx: w.ctxB, projectIds: [w.projectB], ownDraftProjectIds: [], adminProjectIds: [], ...b },
        ],
      });
      expect(await keys(both2({}))).toEqual([`a${mine.id}`]);
      expect(await keys(both2({ ownDraftProjectIds: [w.projectB] }))).toEqual(
        [`a${elsewhere.id}`, `a${mine.id}`].sort(),
      );

      const observer = scopeA(w, w.alice, { ownDraftProjectIds: [] });
      expect(await repo.countGroups(observer, {})).toBe(0);
      expect((await repo.list(observer, { articleId: mine.id }, { limit: 10 })).rows).toEqual([]);
      expect((await repo.listInGroups(observer, {}, [`a${mine.id}`], 10)).length).toBe(0);
      expect((await repo.unreadGroupsByOrg(observer)).size).toBe(0);
      expect(await repo.projectsInInbox(observer)).toEqual([]);
    });
  });

  test('markRead touches only the reader’s rows in the scope organisations', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      await repo.insertMany(w.ctxA, [row(w, w.alice, 'a:1'), row(w, w.alice, 'a:2', { kind: 'commented' })]);
      await repo.insertMany(w.ctxB, [
        row(w, w.bob, 'b:1', { project_id: w.projectB, issue_id: w.issueB.id, actor_id: w.bob }),
      ]);
      expect(await repo.markRead(scopeA(w), { kinds: ['commented'] }, new Date())).toBe(1);
      expect(
        await repo.markRead(
          {
            userId: w.bob,
            orgs: [{ ctx: w.ctxA, projectIds: [w.projectA], ownDraftProjectIds: [], adminProjectIds: [] }],
          },
          {},
          new Date(),
        ),
      ).toBe(0);
      expect(await repo.markRead(scopeA(w), { issueIds: [w.issueA.id] }, new Date())).toBe(1);
      const b = {
        userId: w.bob,
        orgs: [{ ctx: w.ctxB, projectIds: [w.projectB], ownDraftProjectIds: [], adminProjectIds: [] }],
      };
      expect(await repo.countGroups(b, { unread: true })).toBe(1);
    });
  });

  test('eligibleRecipients drops removed members, erased users, other organisations and non-members of the project', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      const member = await carol(tx, w);
      // Alice is an Org Admin; Carol is a plain member without project access; Bob is in the other organisation.
      let found = await repo.eligibleRecipients(w.ctxA, w.projectA, [w.alice, member, w.bob]);
      expect(found.map(r => r.user_id)).toEqual([w.alice]);
      await projectsRepository(tx).addMember(w.ctxA, {
        project_id: w.projectA,
        user_id: member,
        role: 'observer',
        created_by: w.alice,
      });
      found = await repo.eligibleRecipients(w.ctxA, w.projectA, [w.alice, member]);
      expect(found.map(r => r.user_id).sort()).toEqual([w.alice, member].sort());
      await usersRepository(tx).update(sys, member, { deleted_at: new Date() });
      expect((await repo.eligibleRecipients(w.ctxA, w.projectA, [member])).length).toBe(0);
      await organizationsRepository(tx).removeMember(w.ctxA, w.alice);
      expect((await repo.eligibleRecipients(w.ctxA, w.projectA, [w.alice])).length).toBe(0);
      expect((await repo.eligibleRecipients(w.ctxB, w.projectA, [w.alice])).length).toBe(0);
    });
  });

  test('project members and article watchers are read inside the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      await projectsRepository(tx).addMember(w.ctxA, {
        project_id: w.projectA,
        user_id: w.alice,
        role: 'contributor',
        created_by: w.alice,
      });
      expect(await repo.projectMemberIds(w.ctxA, w.projectA)).toEqual([w.alice]);
      expect(await repo.projectMemberIds(w.ctxB, w.projectA)).toEqual([]);
      const article = await insertArticle(tx, w.ctxA, {
        project_id: w.projectA,
        created_by: w.alice,
        title: 'Runbook',
      });
      await articlesRepository(tx).watch(w.ctxA, article.id, [w.alice], 'explicit');
      expect(await repo.articleWatcherIds(w.ctxA, article.id)).toEqual([w.alice]);
      expect(await repo.articleWatcherIds(w.ctxB, article.id)).toEqual([]);

      const comment = await commentsRepository(tx).insert(w.ctxA, {
        article_id: article.id,
        author_id: w.alice,
        body_md: '@alice',
        created_at: new Date(),
      });
      await articlesRepository(tx).replaceMentions(w.ctxA, { type: 'comment', id: comment.id, articleId: article.id }, [
        w.alice,
      ]);
      const since = new Date(Date.now() - 60_000);
      expect(await repo.articleCommentMentions(w.ctxA, article.id, since)).toEqual([
        { comment_id: comment.id, user_id: w.alice, author_id: w.alice },
      ]);
      expect(await repo.articleCommentMentions(w.ctxB, article.id, since)).toEqual([]);
    });
  });

  test('preferences upsert per account; digest candidates and claims', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      await repo.setPreferences(sys, w.alice, [{ kind: 'mentioned', email: 'daily_digest' }]);
      await repo.setPreferences(sys, w.alice, [{ kind: 'mentioned', email: 'instant' }]);
      expect((await repo.preferences(sys, [w.alice])).map(p => p.email)).toEqual(['instant']);
      await repo.setPreferences(sys, w.alice, [{ kind: 'commented', email: 'daily_digest' }]);

      const candidates = await repo.digestCandidates(sys, 'daily_digest', 'daily');
      expect(candidates.filter(c => c.user_id === w.alice).map(c => c.org_id)).toEqual([w.orgA]);
      const at = new Date();
      expect(await repo.claimDigest(w.ctxA, w.alice, 'daily', at, at)).toBe(true);
      expect(await repo.claimDigest(w.ctxA, w.alice, 'daily', at, at)).toBe(false);
      expect(await repo.claimDigest(w.ctxB, w.alice, 'daily', at, at)).toBe(true);
    });
  });

  test('due issues are read per organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      await issuesRepository(tx).update(w.ctxA, w.issueA.id, { due_date: '2026-09-28' });
      await issuesRepository(tx).addAssignees(w.ctxA, w.issueA.id, [w.alice]);
      expect(await repo.orgsWithDueBetween(sys, '2026-09-27', '2026-09-29')).toContain(w.orgA);
      const due = await repo.dueBetween(w.ctxA, '2026-09-27', '2026-09-29');
      expect(due.map(d => [d.issue_id, d.assignee_ids])).toEqual([[w.issueA.id, [w.alice]]]);
      expect(await repo.dueBetween(w.ctxB, '2026-09-27', '2026-09-29')).toEqual([]);
    });
  });

  test('purge removes expired rows of the context organisation only', async () => {
    await inRolledBackTx(async tx => {
      const repo = notificationsRepository(tx);
      const w = await seedIssueWorld(tx);
      const old = new Date(Date.now() - 100 * 86_400_000);
      await repo.insertMany(w.ctxA, [row(w, w.alice, 'a:1', { created_at: old })]);
      await repo.insertMany(w.ctxB, [
        row(w, w.bob, 'b:1', { project_id: w.projectB, issue_id: w.issueB.id, actor_id: w.bob, created_at: old }),
      ]);
      const cutoff = new Date(Date.now() - 90 * 86_400_000);
      expect(await repo.orgsWithExpired(sys, cutoff, cutoff)).toEqual(expect.arrayContaining([w.orgA, w.orgB]));
      expect(await repo.purgeExpired(w.ctxA, cutoff, cutoff)).toBe(1);
      expect(await repo.purgeExpired(w.ctxA, cutoff, cutoff)).toBe(0);
      expect(await repo.purgeExpired(w.ctxB, cutoff, cutoff)).toBe(1);
    });
  });

  test('listCreatedAfter reads one issue’s history inside the organisation', async () => {
    await inRolledBackTx(async tx => {
      const activity = issueActivityRepository(tx);
      const w = await seedIssueWorld(tx);
      const before = new Date(Date.now() - 1000);
      const r = await activity.record(w.ctxA, {
        issue_id: w.issueA.id,
        actor_id: w.alice,
        change_group_id: Bun.randomUUIDv7(),
        kind: 'created',
      });
      expect((await activity.listCreatedAfter(w.ctxA, w.issueA.id, before)).map(a => a.id)).toEqual([r.id]);
      expect(await activity.listCreatedAfter(w.ctxB, w.issueA.id, before)).toEqual([]);
    });
  });
});
