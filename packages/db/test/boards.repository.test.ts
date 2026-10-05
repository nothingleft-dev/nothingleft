import { describe, expect, test } from 'bun:test';
import { boardsRepository } from '../src/repositories/boards.repository.ts';
import { projectSchemaRepository } from '../src/repositories/project-schema.repository.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld } from './fixtures.ts';

describe('boardsRepository tenant isolation', () => {
  test('seed, list, find, findBySlug, layout, update and remove stay in their organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = boardsRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA, projectB } = await seedIssueWorld(tx);
      const a = await repo.seed(ctxA, { id: projectA, key: 'AC', name: 'Acme' }, alice, 'ac');
      const b = await repo.seed(ctxB, { id: projectB, key: 'AC', name: 'Acme' }, bob, 'ac');
      expect(a.swimlane_by).toBe('issues');

      expect((await repo.list(ctxA, projectA)).map(r => r.id)).toEqual([a.id]);
      expect(await repo.list(ctxA, projectB)).toEqual([]);
      expect((await repo.listForProjects(ctxA, [projectA, projectB])).map(r => r.id)).toEqual([a.id]);
      expect((await repo.find(ctxA, projectA, 'acme'))?.id).toBe(a.id);
      expect((await repo.findBySlug(ctxB, 'ac'))?.id).toBe(b.id);
      expect([...(await repo.slugsInOrg(ctxA))]).toEqual(['ac']);

      const layout = await repo.layout(ctxA, [a.id, b.id]);
      expect(layout.get(a.id)!.columns.map(c => c.name)).toEqual(['To do', 'In progress', 'Done']);
      expect(layout.get(a.id)!.columns[0]!.value_ids.length).toBeGreaterThan(0);
      expect(layout.get(a.id)!.swimlane_type_ids).toHaveLength(1);
      expect(layout.get(b.id)!.columns).toEqual([]);

      expect(await repo.update(ctxA, b.id, { name: 'x' }, { columns: [] })).toBeUndefined();
      expect((await repo.layout(ctxB, [b.id])).get(b.id)!.columns).toHaveLength(3);
      expect(await repo.remove(ctxA, b.id)).toBe(false);
      expect(await repo.remove(ctxA, a.id)).toBe(true);
    });
  });

  test('a status maps to one column per board, and only a status of the board’s project', async () => {
    await inRolledBackTx(async tx => {
      const repo = boardsRepository(tx);
      const schema = projectSchemaRepository(tx);
      const { ctxA, ctxB, alice, projectA, projectB } = await seedIssueWorld(tx);
      const [open] = await schema.list(ctxA, 'statuses', projectA);
      const [foreign] = await schema.list(ctxB, 'statuses', projectB);
      const base = { project_id: projectA, name: 'B', slug: 'b', created_by: alice };
      const column = (ids: number[]) => ({
        name: 'c',
        wip_min: null,
        wip_max: null,
        is_collapsed_by_default: false,
        value_ids: ids,
      });
      expect(
        await failsInSavepoint(tx, sp =>
          boardsRepository(sp).insert(ctxA, base, [column([open!.id]), column([open!.id])], []),
        ),
      ).toBe(true);
      expect(
        await failsInSavepoint(tx, sp => boardsRepository(sp).insert(ctxA, base, [column([foreign!.id])], [])),
      ).toBe(true);
      const ok = await repo.insert(ctxA, base, [column([open!.id])], []);
      expect((await repo.layout(ctxA, [ok.id])).get(ok.id)!.columns[0]!.value_ids).toEqual([open!.id]);
    });
  });

  test('a priority board maps priorities once per board, of its own project; deleting one drops its mapping', async () => {
    await inRolledBackTx(async tx => {
      const repo = boardsRepository(tx);
      const schema = projectSchemaRepository(tx);
      const { ctxA, ctxB, alice, projectA, projectB } = await seedIssueWorld(tx);
      const [high, low] = await schema.list(ctxA, 'priorities', projectA);
      const [foreign] = await schema.list(ctxB, 'priorities', projectB);
      const base = { project_id: projectA, name: 'P', slug: 'p', column_field: 'priority', created_by: alice };
      const column = (ids: number[]) => ({
        name: 'c',
        wip_min: null,
        wip_max: null,
        is_collapsed_by_default: false,
        value_ids: ids,
      });
      expect(
        await failsInSavepoint(tx, sp =>
          boardsRepository(sp).insert(ctxA, base, [column([high!.id]), column([high!.id])], []),
        ),
      ).toBe(true);
      expect(
        await failsInSavepoint(tx, sp => boardsRepository(sp).insert(ctxA, base, [column([foreign!.id])], [])),
      ).toBe(true);
      const board = await repo.insert(ctxA, base, [column([high!.id, low!.id])], []);
      expect((await repo.layout(ctxA, [board.id])).get(board.id)!.columns[0]!.value_ids).toEqual([high!.id, low!.id]);
      expect((await repo.layout(ctxB, [board.id])).get(board.id)!.columns).toEqual([]);
      await schema.remove(ctxA, 'priorities', low!.id);
      expect((await repo.layout(ctxA, [board.id])).get(board.id)!.columns[0]!.value_ids).toEqual([high!.id]);
    });
  });
});
