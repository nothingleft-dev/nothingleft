import { describe, expect, test } from 'bun:test';
import { automationsRepository } from '../src/repositories/automations.repository.ts';
import type { Queryable } from '../src/client.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld } from './fixtures.ts';

const at = new Date('2026-10-25T10:00:00Z');

async function seed(tx: Queryable) {
  const world = await seedIssueWorld(tx);
  const repo = automationsRepository(tx);
  const rule = (ctx: typeof world.ctxA, projectId: number, by: number) =>
    repo.insert(ctx, {
      project_id: projectId,
      name: 'Close on merge',
      trigger: 'git.pull_request_merged',
      conditions: {},
      action: 'issue.set_status',
      action_params: { status: 'Fixed' },
      created_by: by,
      updated_by: by,
      created_at: at,
      updated_at: at,
    });
  const ruleA = await rule(world.ctxA, world.projectA, world.alice);
  const ruleB = await rule(world.ctxB, world.projectB, world.bob);
  return { ...world, repo, ruleA, ruleB };
}

describe('automationsRepository tenant isolation', () => {
  test('rules are read, changed and removed only in their own organisation', async () => {
    await inRolledBackTx(async tx => {
      const { repo, ctxA, ctxB, projectA, ruleA } = await seed(tx);
      expect(await repo.listForProject(ctxB, projectA)).toEqual([]);
      expect(await repo.enabledFor(ctxB, [projectA], 'git.pull_request_merged')).toEqual([]);
      expect(await repo.findByName(ctxB, projectA, 'close on merge')).toBeUndefined();
      expect(await repo.countForProject(ctxB, projectA)).toBe(0);
      expect(await repo.update(ctxB, ruleA.id, { is_enabled: false, updated_by: 1, updated_at: at })).toBeUndefined();
      expect(await repo.renameStatus(ctxB, projectA, 'Fixed', 'Done', at)).toBe(0);
      expect(await repo.remove(ctxB, ruleA.id)).toBeUndefined();

      expect((await repo.findByName(ctxA, projectA, 'CLOSE ON MERGE'))?.id).toBe(ruleA.id);
      expect(await repo.renameStatus(ctxA, projectA, 'fixed', 'Done', at)).toBe(1);
      expect((await repo.listForProject(ctxA, projectA))[0]!.action_params).toEqual({ status: 'Done' });
    });
  });

  test('a rule cannot point at another organisation’s project', async () => {
    await inRolledBackTx(async tx => {
      const { repo, ctxA, projectB, alice } = await seed(tx);
      expect(
        await failsInSavepoint(tx, sp =>
          automationsRepository(sp).insert(ctxA, {
            project_id: projectB,
            name: 'Elsewhere',
            trigger: 'git.branch_created',
            action: 'issue.set_status',
            created_by: alice,
            updated_by: alice,
          }),
        ),
      ).toBe(true);
      expect(await repo.countForProject(ctxA, projectB)).toBe(0);
    });
  });

  test('runs are recorded, listed and counted only in their own organisation', async () => {
    await inRolledBackTx(async tx => {
      const { repo, ctxA, ctxB, ruleA, issueA, issueB } = await seed(tx);
      const run = await repo.recordRun(ctxA, {
        automation_id: ruleA.id,
        issue_id: issueA.id,
        trigger_ref: { pull_request: 'acme/web#1' },
        caused_by: null,
        result: 'applied',
        reason: null,
        changes: null,
      });
      expect(await repo.runsByIds(ctxB, [run.id])).toEqual([]);
      expect(await repo.listRuns(ctxB, { automationIds: [ruleA.id] }, { limit: 10, offset: 0 })).toEqual({
        rows: [],
        total: 0,
      });
      expect(await repo.runStats(ctxB, [ruleA.id], new Date(0))).toEqual([]);
      expect((await repo.listRuns(ctxA, { automationIds: [ruleA.id] }, { limit: 10, offset: 0 })).total).toBe(1);
      expect((await repo.runStats(ctxA, [ruleA.id], new Date(0)))[0]!.runs).toBe(1);

      // A run of org A's rule on org B's issue is refused by the composite keys.
      expect(
        await failsInSavepoint(tx, sp =>
          automationsRepository(sp).recordRun(ctxA, {
            automation_id: ruleA.id,
            issue_id: issueB.id,
            trigger_ref: {},
            result: 'skipped',
            reason: 'condition_not_met',
          }),
        ),
      ).toBe(true);
    });
  });
});
