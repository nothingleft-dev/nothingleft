import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { projectSchemaRepository } from '../src/repositories/project-schema.repository.ts';
import { schema } from '../src/index.ts';
import { inRolledBackTx, seedIssueWorld } from './fixtures.ts';

describe('projectSchemaRepository tenant isolation', () => {
  test('seed writes the documented defaults, one default per table', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectSchemaRepository(tx);
      const { ctxA, projectA } = await seedIssueWorld(tx);
      const statuses = await repo.list(ctxA, 'statuses', projectA);
      expect(statuses.map(s => s.name)).toEqual([
        'Submitted',
        'Open',
        'In Progress',
        'Reopened',
        "Can't Reproduce",
        'Duplicate',
        'Fixed',
        "Won't fix",
        'Obsolete',
        'Closed',
      ]);
      expect(statuses.filter(s => s.is_default).map(s => s.name)).toEqual(['Open']);
      expect((await repo.list(ctxA, 'priorities', projectA)).find(p => p.is_default)?.name).toBe('Normal');
      expect((await repo.list(ctxA, 'types', projectA)).find(p => p.is_default)?.name).toBe('Bug');
      const workTypes = await repo.list(ctxA, 'work_types', projectA);
      expect(workTypes.map(w => w.name)).toEqual([
        'Development',
        'Documentation',
        'Implementation',
        'Investigation',
        'Maintenance',
        'Observation',
        'Testing',
      ]);
      expect(workTypes.filter(w => w.is_default).map(w => w.name)).toEqual(['Development']);
    });
  });

  test("list and findByIds never return another organisation's values", async () => {
    await inRolledBackTx(async tx => {
      const repo = projectSchemaRepository(tx);
      const { ctxA, ctxB, projectB } = await seedIssueWorld(tx);
      expect(await repo.list(ctxA, 'statuses', projectB)).toEqual([]);
      const idsB = (await repo.list(ctxB, 'priorities', projectB)).map(r => r.id);
      expect(await repo.findByIds(ctxA, 'priorities', idsB)).toEqual([]);
      expect((await repo.findByIds(ctxB, 'priorities', idsB)).length).toBe(idsB.length);
    });
  });

  test("insert, update, reorder, clearDefault and remove touch only the caller's rows", async () => {
    await inRolledBackTx(async tx => {
      const repo = projectSchemaRepository(tx);
      const { ctxA, ctxB, projectA, projectB } = await seedIssueWorld(tx);
      const row = await repo.insert(ctxA, 'work_types', projectA, {
        name: 'Review',
        short_label: 'R',
        position: 5,
        is_default: false,
        is_archived: false,
      });
      expect(row.org_id).toBe(ctxA.orgId);

      expect(await repo.update(ctxB, 'work_types', row.id, { name: 'Hijacked' })).toBeUndefined();
      expect((await repo.update(ctxA, 'work_types', row.id, { name: 'Code review' }))?.name).toBe('Code review');

      await repo.reorder(ctxB, 'work_types', [row.id]);
      expect((await repo.findByIds(ctxA, 'work_types', [row.id]))[0]?.position).toBe(5);
      await repo.reorder(ctxA, 'work_types', [row.id]);
      expect((await repo.findByIds(ctxA, 'work_types', [row.id]))[0]?.position).toBe(0);

      await repo.clearDefault(ctxB, 'statuses', projectA);
      expect((await repo.list(ctxA, 'statuses', projectA)).some(s => s.is_default)).toBe(true);
      await repo.clearDefault(ctxA, 'statuses', projectA);
      expect((await repo.list(ctxA, 'statuses', projectA)).some(s => s.is_default)).toBe(false);
      expect((await repo.list(ctxB, 'statuses', projectB)).some(s => s.is_default)).toBe(true);

      expect(await repo.remove(ctxB, 'work_types', row.id)).toBe(false);
      expect(await repo.remove(ctxA, 'work_types', row.id)).toBe(true);
    });
  });

  test("countUsage and reassign see only the caller's issues", async () => {
    await inRolledBackTx(async tx => {
      const repo = projectSchemaRepository(tx);
      const { ctxA, ctxB, projectA, issueA, issueB } = await seedIssueWorld(tx);
      const [submitted, open] = await repo.list(ctxA, 'statuses', projectA);
      expect(await repo.countUsage(ctxA, 'statuses', submitted!.id)).toBe(1);
      expect(await repo.countUsage(ctxB, 'statuses', submitted!.id)).toBe(0);
      expect(await repo.countUsage(ctxB, 'statuses', issueB.status_id)).toBe(1);

      expect(await repo.reassign(ctxB, 'statuses', submitted!.id, open!.id)).toEqual([]);
      expect(await repo.reassign(ctxA, 'statuses', submitted!.id, open!.id)).toEqual([issueA.id]);
      expect(await repo.countUsage(ctxA, 'work_types', open!.id)).toBe(0);
    });
  });

  test('a status from another project is unwritable on an issue', async () => {
    await inRolledBackTx(async tx => {
      const repo = projectSchemaRepository(tx);
      const { ctxB, projectB, issueA } = await seedIssueWorld(tx);
      const [foreign] = await repo.list(ctxB, 'statuses', projectB);
      const attempt = async () =>
        tx.update(schema.issues).set({ status_id: foreign!.id }).where(eq(schema.issues.id, issueA.id));
      await expect(attempt()).rejects.toThrow();
    });
  });
});
