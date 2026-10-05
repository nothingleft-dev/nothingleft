import { describe, expect, test } from 'bun:test';
import { issueLinksRepository } from '../src/repositories/issue-links.repository.ts';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import type { Queryable } from '../src/client.ts';
import type { IssueRow } from '../src/schema/index.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld } from './fixtures.ts';

async function another(tx: Queryable, ctx: TenantContext, like: IssueRow, parentId: number | null = null) {
  return issuesRepository(tx).insert(ctx, {
    project_id: like.project_id,
    key_number: await projectsRepository(tx).claimIssueNumber(ctx, like.project_id),
    title: 'Another',
    status_id: like.status_id,
    priority_id: like.priority_id,
    type_id: like.type_id,
    created_by: like.created_by,
    updated_by: like.created_by,
    parent_id: parentId,
  });
}

describe('issueLinksRepository tenant isolation', () => {
  test('a link cannot join issues of two organisations, or be written under the wrong one', async () => {
    await inRolledBackTx(async tx => {
      const repo = issueLinksRepository(tx);
      const { ctxA, ctxB, alice, issueA, issueB } = await seedIssueWorld(tx);
      const at = new Date();
      const ends = { from_issue_id: issueA.id, to_issue_id: issueB.id, type: 'relates' };
      expect(
        await failsInSavepoint(tx, sp =>
          issueLinksRepository(sp).insert(ctxA, { ...ends, created_by: alice, created_at: at }),
        ),
      ).toBe(true);
      const b2 = await another(tx, ctxA, issueA);
      const wrongTenant = {
        from_issue_id: issueA.id,
        to_issue_id: b2.id,
        type: 'relates',
        created_by: alice,
        created_at: at,
      };
      expect(await failsInSavepoint(tx, sp => issueLinksRepository(sp).insert(ctxB, wrongTenant))).toBe(true);
      expect(await repo.insert(ctxA, wrongTenant)).toBeDefined();
    });
  });

  test('exists, listForIssue, reaches and remove answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = issueLinksRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const [b, c] = [await another(tx, ctxA, issueA), await another(tx, ctxA, issueA)];
      const at = new Date();
      const ab = { from_issue_id: issueA.id, to_issue_id: b.id, type: 'depends' };
      const bc = { from_issue_id: b.id, to_issue_id: c.id, type: 'depends' };
      expect(await repo.insert(ctxA, { ...ab, created_by: alice, created_at: at })).toBeDefined();
      expect(await repo.insert(ctxA, { ...ab, created_by: alice, created_at: at })).toBeUndefined();
      await repo.insert(ctxA, { ...bc, created_by: alice, created_at: at });

      expect(await repo.exists(ctxA, ab)).toBe(true);
      expect(await repo.exists(ctxB, ab)).toBe(false);
      expect((await repo.listForIssue(ctxA, b.id)).map(l => l.other.id).sort()).toEqual([issueA.id, c.id].sort());
      expect(await repo.listForIssue(ctxB, b.id)).toEqual([]);
      expect(await repo.reaches(ctxA, 'depends', issueA.id, c.id)).toBe(true);
      expect(await repo.reaches(ctxA, 'depends', c.id, issueA.id)).toBe(false);
      expect(await repo.reaches(ctxB, 'depends', issueA.id, c.id)).toBe(false);
      expect(await repo.remove(ctxB, ab)).toBeUndefined();
      expect(await repo.remove(ctxA, ab)).toBeDefined();
    });
  });
});

describe('issuesRepository hierarchy and refs, tenant isolation', () => {
  test('ancestorIds, subtreeHeight and listChildren stay in the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, issueA } = await seedIssueWorld(tx);
      const child = await another(tx, ctxA, issueA, issueA.id);
      const grandchild = await another(tx, ctxA, issueA, child.id);
      expect(await repo.ancestorIds(ctxA, grandchild.id)).toEqual([child.id, issueA.id]);
      expect(await repo.ancestorIds(ctxB, grandchild.id)).toEqual([]);
      expect(await repo.subtreeHeight(ctxA, issueA.id)).toBe(3);
      expect(await repo.subtreeHeight(ctxB, issueA.id)).toBe(1);
      expect((await repo.listChildren(ctxA, issueA.id)).map(r => r.id)).toEqual([child.id]);
      expect(await repo.listChildren(ctxB, issueA.id)).toEqual([]);
      expect(await repo.findById(ctxB, issueA.id)).toBeUndefined();
      expect((await repo.findById(ctxA, issueA.id))?.id).toBe(issueA.id);
    });
  });

  test('adjustCommentCount, findByKeys and pick never touch another organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, projectA, issueA } = await seedIssueWorld(tx);
      await repo.adjustCommentCount(ctxB, issueA.id, 1);
      await repo.adjustCommentCount(ctxA, issueA.id, 1);
      expect((await repo.findById(ctxA, issueA.id))?.comment_count).toBe(1);

      const key = { projectId: projectA, number: 1 };
      expect((await repo.findByKeys(ctxA, [key])).map(r => r.id)).toEqual([issueA.id]);
      expect(await repo.findByKeys(ctxB, [key])).toEqual([]);

      const byTitle = { projectIds: [projectA], text: 'redirect', limit: 5 };
      expect((await repo.pick(ctxA, byTitle)).map(r => r.id)).toEqual([issueA.id]);
      expect(await repo.pick(ctxB, byTitle)).toEqual([]);
      const byKey = { ...byTitle, text: 'AC-1', key: { projectId: projectA, numberPrefix: '1' } };
      expect((await repo.pick(ctxA, byKey)).map(r => r.id)).toEqual([issueA.id]);
    });
  });
});
