import { describe, expect, test } from 'bun:test';
import { tagsRepository } from '../src/repositories/tags.repository.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld } from './fixtures.ts';

describe('tagsRepository tenant isolation', () => {
  test('tags are per organisation: one slug in two organisations is two tags', async () => {
    await inRolledBackTx(async tx => {
      const repo = tagsRepository(tx);
      const { ctxA, ctxB, alice, bob } = await seedIssueWorld(tx);
      await repo.insertMissing(ctxA, [
        { name: 'Needs Review', slug: 'needs-review', color: 'amber', created_by: alice },
      ]);
      await repo.insertMissing(ctxB, [{ name: 'needs review', slug: 'needs-review', color: 'blue', created_by: bob }]);
      const [a] = await repo.findBySlugs(ctxA, ['needs-review']);
      const [b] = await repo.findBySlugs(ctxB, ['needs-review']);
      expect(a?.name).toBe('Needs Review');
      expect(b?.name).toBe('needs review');
    });
  });

  test('a slug already taken keeps its first spelling', async () => {
    await inRolledBackTx(async tx => {
      const repo = tagsRepository(tx);
      const { ctxA, alice } = await seedIssueWorld(tx);
      await repo.insertMissing(ctxA, [
        { name: 'Area:Billing', slug: 'area:billing', color: 'teal', created_by: alice },
      ]);
      await repo.insertMissing(ctxA, [{ name: 'area:billing', slug: 'area:billing', color: 'red', created_by: alice }]);
      expect(await repo.findBySlugs(ctxA, ['area:billing'])).toMatchObject([{ name: 'Area:Billing', color: 'teal' }]);
    });
  });

  test('apply, listForIssues and remove never cross organisations', async () => {
    await inRolledBackTx(async tx => {
      const repo = tagsRepository(tx);
      const { ctxA, ctxB, alice, bob, issueA, issueB } = await seedIssueWorld(tx);
      await repo.insertMissing(ctxA, [{ name: 'x', slug: 'x', color: 'red', created_by: alice }]);
      await repo.insertMissing(ctxB, [{ name: 'x', slug: 'x', color: 'red', created_by: bob }]);
      const [tagA] = await repo.findBySlugs(ctxA, ['x']);
      const [tagB] = await repo.findBySlugs(ctxB, ['x']);

      expect(await repo.apply(ctxA, issueA.id, [tagA!.id])).toEqual([tagA!.id]);
      expect(await repo.apply(ctxA, issueA.id, [tagA!.id])).toEqual([]);
      expect(await failsInSavepoint(tx, sp => tagsRepository(sp).apply(ctxA, issueA.id, [tagB!.id]))).toBe(true);
      expect(await failsInSavepoint(tx, sp => tagsRepository(sp).apply(ctxB, issueA.id, [tagB!.id]))).toBe(true);
      expect(await repo.listForIssues(ctxB, [issueA.id, issueB.id])).toEqual([]);
      expect((await repo.listForIssues(ctxA, [issueA.id])).map(r => r.tag.id)).toEqual([tagA!.id]);
      expect(await repo.remove(ctxB, issueA.id, tagA!.id)).toBe(false);
      expect(await repo.remove(ctxA, issueA.id, tagA!.id)).toBe(true);
    });
  });
});
