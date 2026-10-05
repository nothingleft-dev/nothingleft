import { describe, expect, test } from 'bun:test';
import { orgActivityRepository } from '../src/repositories/org-activity.repository.ts';
import { inRolledBackTx, seedTwoOrgs } from './fixtures.ts';

describe('orgActivityRepository tenant isolation', () => {
  test('rows recorded in one organisation never list or count in another', async () => {
    await inRolledBackTx(async tx => {
      const repo = orgActivityRepository(tx);
      const { ctxA, ctxB, alice, bob } = await seedTwoOrgs(tx);
      const a = await repo.record(ctxA, {
        actor_id: alice,
        kind: 'project_created',
        target_type: 'project',
        target_id: '1',
        new_value: { key: 'PP' },
        ip: '10.0.0.1',
      });
      await repo.record(ctxB, { actor_id: bob, kind: 'project_created', target_type: 'project', target_id: '2' });

      expect(a.org_id).toBe(ctxA.orgId);
      const listed = await repo.list(ctxA, { limit: 50 });
      expect(listed.map(r => r.activity.id)).toEqual([a.id]);
      expect(listed[0]?.actor?.id).toBe(alice);
      expect(listed[0]?.actor_membership?.org_id).toBe(ctxA.orgId);
      expect(await repo.count(ctxA, {})).toBe(1);
      expect(await repo.list(ctxA, { actorId: bob, limit: 50 })).toEqual([]);
    });
  });

  test('filters by actor, kind and date, and pages newest first by id', async () => {
    await inRolledBackTx(async tx => {
      const repo = orgActivityRepository(tx);
      const { ctxA, alice } = await seedTwoOrgs(tx);
      const kinds = ['member_joined', 'role_changed', 'role_changed'] as const;
      const ids: number[] = [];
      for (const kind of kinds) {
        ids.push((await repo.record(ctxA, { actor_id: alice, kind, target_type: 'member', target_id: '1' })).id);
      }

      const firstPage = await repo.list(ctxA, { limit: 2 });
      expect(firstPage.map(r => r.activity.id)).toEqual([ids[2]!, ids[1]!]);
      const next = await repo.list(ctxA, { limit: 2, beforeId: ids[1] });
      expect(next.map(r => r.activity.id)).toEqual([ids[0]!]);

      expect((await repo.list(ctxA, { kinds: ['role_changed'], limit: 50 })).length).toBe(2);
      expect(await repo.count(ctxA, { actorId: alice, kinds: ['member_joined'] })).toBe(1);
      expect(await repo.count(ctxA, { from: new Date(Date.now() + 60_000) })).toBe(0);
      expect(await repo.count(ctxA, { to: new Date(Date.now() + 60_000) })).toBe(3);
    });
  });
});
