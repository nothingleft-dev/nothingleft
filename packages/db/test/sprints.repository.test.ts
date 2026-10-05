import { describe, expect, test } from 'bun:test';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { sprintsRepository } from '../src/repositories/sprints.repository.ts';
import type { Queryable } from '../src/client.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld, sys } from './fixtures.ts';

const sprintIn = (tx: Queryable, ctx: TenantContext, projectId: number, userId: number, name = 'September 2026') =>
  sprintsRepository(tx).insert(ctx, {
    project_id: projectId,
    name,
    slug: name.toLowerCase().replace(/ /g, '-'),
    created_by: userId,
  });

describe('sprintsRepository tenant isolation', () => {
  test('list, find, findActive, findByIds, lock, slugsInProject stay in their organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = sprintsRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const a = await sprintIn(tx, ctxA, projectA, alice);
      const b = await sprintIn(tx, ctxB, projectB, bob);
      await repo.update(ctxA, a.id, { state: 'active' });
      await repo.update(ctxB, b.id, { state: 'active' });

      expect((await repo.list(ctxA, [projectA, projectB])).map(s => s.id)).toEqual([a.id]);
      expect((await repo.find(ctxA, projectA, 'SEPTEMBER 2026'))?.id).toBe(a.id);
      expect((await repo.find(ctxA, projectA, 'september-2026'))?.id).toBe(a.id);
      expect(await repo.find(ctxA, projectB, 'september-2026')).toBeUndefined();
      expect((await repo.findActive(ctxA, projectA))?.id).toBe(a.id);
      expect(await repo.findActive(ctxA, projectB)).toBeUndefined();
      expect((await repo.findByIds(ctxA, [a.id, b.id])).map(s => s.id)).toEqual([a.id]);
      expect(await repo.lock(ctxA, b.id)).toBeUndefined();
      expect([...(await repo.slugsInProject(ctxB, projectA))]).toEqual([]);
      expect(await repo.update(ctxA, b.id, { name: 'x' })).toBeUndefined();
      expect(await repo.remove(ctxA, b.id)).toBe(false);
      const everywhere = await repo.listActiveEverywhere(sys);
      expect(everywhere.map(s => s.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    });
  });

  test('one active sprint per project; an issue cannot join another project’s sprint', async () => {
    await inRolledBackTx(async tx => {
      const repo = sprintsRepository(tx);
      const { ctxA, alice, projectA, projectB, issueA, ctxB, bob } = await seedIssueWorld(tx);
      const one = await sprintIn(tx, ctxA, projectA, alice);
      const two = await sprintIn(tx, ctxA, projectA, alice, 'October 2026');
      await repo.update(ctxA, one.id, { state: 'active' });
      expect(await failsInSavepoint(tx, sp => sprintsRepository(sp).update(ctxA, two.id, { state: 'active' }))).toBe(
        true,
      );
      const other = await sprintIn(tx, ctxB, projectB, bob);
      expect(
        await failsInSavepoint(tx, sp => issuesRepository(sp).update(ctxA, issueA.id, { sprint_id: other.id })),
      ).toBe(true);
    });
  });

  test('figures, statusCounts, snapshots and writeSnapshot count only their own organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = sprintsRepository(tx);
      const issues = issuesRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB, issueA, issueB } = await seedIssueWorld(tx);
      const a = await sprintIn(tx, ctxA, projectA, alice);
      const b = await sprintIn(tx, ctxB, projectB, bob);
      await issues.update(ctxA, issueA.id, { sprint_id: a.id, story_points: 3, estimate_minutes: 60 });
      await issues.update(ctxB, issueB.id, { sprint_id: b.id, story_points: 8 });

      const figures = await repo.figures(ctxA, [a.id, b.id], alice);
      expect([...figures.keys()]).toEqual([a.id]);
      expect(figures.get(a.id)).toMatchObject({ issues: 1, points: 3, remaining_estimate_minutes: 60 });
      expect((await repo.valueCounts(ctxA, [a.id, b.id])).map(c => c.sprint_id)).toEqual([a.id]);
      expect(await repo.valueCounts(ctxA, [a.id, b.id], 'priority')).toEqual([
        { sprint_id: a.id, value_id: issueA.priority_id, n: 1 },
      ]);
      await repo.writeSnapshot(ctxA, a.id, '2026-09-20');
      await repo.writeSnapshot(ctxA, b.id, '2026-09-20');
      await repo.writeSnapshot(ctxA, a.id, '2026-09-20');
      expect(await repo.snapshots(ctxA, a.id)).toMatchObject([{ total_points: 3, total_issues: 1 }]);
      expect(await repo.snapshots(ctxB, b.id)).toEqual([]);
      expect(await repo.snapshots(ctxB, a.id)).toEqual([]);
    });
  });
});

describe('issuesRepository agile methods, tenant isolation', () => {
  test('lockContainer, place, listInSprint, clearSprint touch only their organisation', async () => {
    await inRolledBackTx(async tx => {
      const issues = issuesRepository(tx);
      const { ctxA, ctxB, alice, projectA, projectB, issueA, issueB } = await seedIssueWorld(tx);
      const a = await sprintIn(tx, ctxA, projectA, alice);
      expect((await issues.lockContainer(ctxA, projectA, null)).map(r => r.id)).toEqual([issueA.id]);
      expect(await issues.lockContainer(ctxA, projectB, null)).toEqual([]);
      await issues.place(ctxA, [
        { id: issueA.id, sprint_id: a.id, rank: 2 },
        { id: issueB.id, sprint_id: null, rank: 99 },
      ]);
      expect((await issues.findById(ctxB, issueB.id))?.rank).toBeNull();
      expect((await issues.listInSprint(ctxA, a.id)).map(r => r.id)).toEqual([issueA.id]);
      expect(await issues.listInSprint(ctxB, a.id)).toEqual([]);
      await issues.clearSprint(ctxB, a.id);
      expect((await issues.findById(ctxA, issueA.id))?.sprint_id).toBe(a.id);
      await issues.clearSprint(ctxA, a.id);
      expect((await issues.findById(ctxA, issueA.id))?.sprint_id).toBeNull();
    });
  });

  test('subtaskProgress, storyPointsRollup, nearestAncestorOfTypes never cross organisations', async () => {
    await inRolledBackTx(async tx => {
      const issues = issuesRepository(tx);
      const { ctxA, ctxB, alice, projectA, issueA } = await seedIssueWorld(tx);
      const child = await issues.insert(ctxA, {
        project_id: projectA,
        key_number: 99,
        title: 'child',
        status_id: issueA.status_id,
        priority_id: issueA.priority_id,
        type_id: issueA.type_id,
        created_by: alice,
        updated_by: alice,
        parent_id: issueA.id,
        story_points: 5,
      });
      expect(await issues.subtaskProgress(ctxA, [issueA.id])).toEqual(
        new Map([[issueA.id, { resolved: 0, total: 1 }]]),
      );
      expect(await issues.subtaskProgress(ctxB, [issueA.id])).toEqual(new Map());
      expect(await issues.storyPointsRollup(ctxA, [issueA.id])).toEqual(new Map([[issueA.id, 5]]));
      expect(await issues.storyPointsRollup(ctxB, [issueA.id])).toEqual(new Map());
      expect(await issues.nearestAncestorOfTypes(ctxA, [child.id], [issueA.type_id])).toEqual(
        new Map([[child.id, issueA.id]]),
      );
      expect(await issues.nearestAncestorOfTypes(ctxB, [child.id], [issueA.type_id])).toEqual(new Map());
    });
  });
});
