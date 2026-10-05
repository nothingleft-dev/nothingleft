import { describe, expect, test } from 'bun:test';
import { issueActivityRepository } from '../src/repositories/issue-activity.repository.ts';
import { inRolledBackTx, seedIssueWorld } from './fixtures.ts';

const row = (issueId: number, actorId: number, kind: 'field_changed' | 'commented' = 'field_changed') => ({
  issue_id: issueId,
  actor_id: actorId,
  change_group_id: Bun.randomUUIDv7(),
  kind,
  field: kind === 'field_changed' ? 'priority' : null,
  old_value: { name: 'Normal' },
  new_value: { name: 'Major' },
});

describe('issueActivityRepository tenant isolation', () => {
  test('record, list and count never cross organisations', async () => {
    await inRolledBackTx(async tx => {
      const repo = issueActivityRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const a = await repo.record(ctxA, row(issueA.id, alice));
      expect(a.org_id).toBe(ctxA.orgId);
      expect((await repo.list(ctxA, issueA.id, { limit: 10 })).map(r => r.activity.id)).toEqual([a.id]);
      expect(await repo.list(ctxB, issueA.id, { limit: 10 })).toEqual([]);
      expect(await repo.count(ctxA, issueA.id)).toBe(1);
      expect(await repo.count(ctxB, issueA.id)).toBe(0);
      await expect(repo.record(ctxB, row(issueA.id, alice))).rejects.toThrow();
    });
  });

  test('pages oldest first after a cursor id', async () => {
    await inRolledBackTx(async tx => {
      const repo = issueActivityRepository(tx);
      const { ctxA, alice, issueA } = await seedIssueWorld(tx);
      const ids: number[] = [];
      for (let i = 0; i < 3; i += 1) ids.push((await repo.record(ctxA, row(issueA.id, alice))).id);
      expect((await repo.list(ctxA, issueA.id, { limit: 2 })).map(r => r.activity.id)).toEqual(ids.slice(0, 2));
      expect((await repo.list(ctxA, issueA.id, { afterId: ids[1], limit: 2 })).map(r => r.activity.id)).toEqual([
        ids[2]!,
      ]);
    });
  });

  test('coalescing reads and writes stay inside the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = issueActivityRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const a = await repo.record(ctxA, row(issueA.id, alice));
      expect((await repo.latestFieldChange(ctxA, issueA.id, 'priority'))?.id).toBe(a.id);
      expect(await repo.latestFieldChange(ctxB, issueA.id, 'priority')).toBeUndefined();

      expect(await repo.hasCommentAfter(ctxA, issueA.id, a.id)).toBe(false);
      await repo.record(ctxA, row(issueA.id, alice, 'commented'));
      expect(await repo.hasCommentAfter(ctxA, issueA.id, a.id)).toBe(true);
      expect(await repo.hasCommentAfter(ctxB, issueA.id, a.id)).toBe(false);

      expect(await repo.rewrite(ctxB, a.id, { name: 'Minor' }, new Date())).toBeUndefined();
      expect((await repo.rewrite(ctxA, a.id, { name: 'Minor' }, new Date()))?.new_value).toEqual({ name: 'Minor' });

      await repo.erase(ctxB, a.id);
      expect((await repo.latestFieldChange(ctxA, issueA.id, 'priority'))?.id).toBe(a.id);
      await repo.erase(ctxA, a.id);
      expect(await repo.latestFieldChange(ctxA, issueA.id, 'priority')).toBeUndefined();
    });
  });
});
