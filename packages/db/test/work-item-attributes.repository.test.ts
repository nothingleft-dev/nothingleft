import { describe, expect, test } from 'bun:test';
import { workItemAttributesRepository } from '../src/repositories/work-item-attributes.repository.ts';
import { workItemsRepository } from '../src/repositories/work-items.repository.ts';
import type { Queryable } from '../src/client.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld, seedSiblingProject } from './fixtures.ts';

async function attributeIn(tx: Queryable, ctx: TenantContext, projectId: number) {
  const repo = workItemAttributesRepository(tx);
  const attribute = await repo.insert(ctx, projectId, { name: 'Billable', position: 0 });
  const values = await repo.insertValues(ctx, attribute.id, [
    { name: 'Yes', short_label: 'Y', position: 0 },
    { name: 'No', short_label: 'N', position: 1 },
  ]);
  return { attribute, values };
}

async function workItemOn(tx: Queryable, ctx: TenantContext, issueId: number, userId: number) {
  const [row] = await workItemsRepository(tx).insertMany(ctx, [
    {
      issue_id: issueId,
      author_id: userId,
      created_by: userId,
      work_date: '2026-09-21',
      duration_minutes: 60,
      work_type_id: null,
      description_md: '',
    },
  ]);
  return row!;
}

describe('workItemAttributesRepository tenant isolation', () => {
  test("attributes and values are read and written only in the caller's organisation", async () => {
    await inRolledBackTx(async tx => {
      const repo = workItemAttributesRepository(tx);
      const { ctxA, ctxB, projectA, projectB } = await seedIssueWorld(tx);
      const a = await attributeIn(tx, ctxA, projectA);
      await attributeIn(tx, ctxB, projectB);

      expect((await repo.listForProjects(ctxA, [projectA, projectB])).map(r => r.id)).toEqual([a.attribute.id]);
      expect(await repo.listValues(ctxB, [a.attribute.id])).toEqual([]);
      expect((await repo.listValues(ctxA, [a.attribute.id])).map(v => v.name)).toEqual(['Yes', 'No']);

      expect(await repo.update(ctxB, a.attribute.id, { name: 'X' })).toBeUndefined();
      expect((await repo.update(ctxA, a.attribute.id, { name: 'Chargeable' }))?.name).toBe('Chargeable');
      await repo.update(ctxA, a.attribute.id, { position: 3 });
      await repo.reorder(ctxB, [a.attribute.id]);
      expect((await repo.listForProjects(ctxA, [projectA]))[0]?.position).toBe(3);
      await repo.reorder(ctxA, [a.attribute.id]);
      expect((await repo.listForProjects(ctxA, [projectA]))[0]?.position).toBe(0);

      expect(await repo.updateValue(ctxB, a.values[0]!.id, { name: 'X' })).toBeUndefined();
      expect((await repo.updateValue(ctxA, a.values[0]!.id, { short_label: 'B' }))?.short_label).toBe('B');
      await repo.reorderValues(ctxB, [a.values[1]!.id, a.values[0]!.id]);
      expect((await repo.listValues(ctxA, [a.attribute.id]))[0]?.name).toBe('Yes');
      await repo.reorderValues(ctxA, [a.values[1]!.id, a.values[0]!.id]);
      expect((await repo.listValues(ctxA, [a.attribute.id]))[0]?.name).toBe('No');

      expect(await repo.removeValue(ctxB, a.values[0]!.id)).toBe(false);
      expect(await repo.removeValue(ctxA, a.values[0]!.id)).toBe(true);
      expect(await repo.remove(ctxB, a.attribute.id)).toBe(false);
      expect(await repo.remove(ctxA, a.attribute.id)).toBe(true);
      expect(await repo.listForProjects(ctxB, [projectB])).toHaveLength(1);
    });
  });

  test("work item values: set, counted and moved only on the caller's work items", async () => {
    await inRolledBackTx(async tx => {
      const repo = workItemAttributesRepository(tx);
      const { ctxA, ctxB, projectA, projectB, issueA, issueB, alice, bob } = await seedIssueWorld(tx);
      const a = await attributeIn(tx, ctxA, projectA);
      const b = await attributeIn(tx, ctxB, projectB);
      const itemA = await workItemOn(tx, ctxA, issueA.id, alice);
      const itemB = await workItemOn(tx, ctxB, issueB.id, bob);

      await repo.setValues(ctxA, [itemA.id], [{ attribute_id: a.attribute.id, value_id: a.values[0]!.id }]);
      await repo.setValues(ctxB, [itemB.id], [{ attribute_id: b.attribute.id, value_id: b.values[0]!.id }]);
      expect((await repo.valuesForWorkItems(ctxA, [itemA.id, itemB.id])).map(v => v.work_item_id)).toEqual([itemA.id]);
      expect(await repo.countValueUsage(ctxA, a.values[0]!.id)).toBe(1);
      expect(await repo.countValueUsage(ctxB, a.values[0]!.id)).toBe(0);
      expect(await repo.countAttributeUsage(ctxA, a.attribute.id)).toBe(1);
      expect(await repo.countAttributeUsage(ctxB, a.attribute.id)).toBe(0);

      expect(await repo.moveValue(ctxB, a.values[0]!.id, a.values[1]!.id)).toBe(0);
      expect(await repo.moveValue(ctxA, a.values[0]!.id, a.values[1]!.id)).toBe(1);
      await repo.setValues(ctxB, [itemA.id], [{ attribute_id: a.attribute.id, value_id: null }]);
      expect((await repo.valuesForWorkItems(ctxA, [itemA.id]))[0]?.value_id).toBe(a.values[1]!.id);
      await repo.setValues(ctxA, [itemA.id], [{ attribute_id: a.attribute.id, value_id: null }]);
      expect(await repo.valuesForWorkItems(ctxA, [itemA.id])).toEqual([]);
      expect(await repo.valuesForWorkItems(ctxB, [itemB.id])).toHaveLength(1);
    });
  });

  test('a value of another attribute is unwritable', async () => {
    await inRolledBackTx(async tx => {
      const repo = workItemAttributesRepository(tx);
      const { ctxA, projectA, issueA, alice } = await seedIssueWorld(tx);
      const a = await attributeIn(tx, ctxA, projectA);
      const other = await repo.insert(ctxA, projectA, { name: 'Phase', position: 1 });
      const item = await workItemOn(tx, ctxA, issueA.id, alice);
      expect(
        await failsInSavepoint(tx, sp =>
          workItemAttributesRepository(sp).setValues(
            ctxA,
            [item.id],
            [{ attribute_id: other.id, value_id: a.values[0]!.id }],
          ),
        ),
      ).toBe(true);
    });
  });
});

describe('work item values are bound to the work item’s project', () => {
  test('setValues writes the work item’s project', async () => {
    await inRolledBackTx(async tx => {
      const repo = workItemAttributesRepository(tx);
      const { ctxA, projectA, issueA, alice } = await seedIssueWorld(tx);
      const a = await attributeIn(tx, ctxA, projectA);
      const item = await workItemOn(tx, ctxA, issueA.id, alice);
      await repo.setValues(ctxA, [item.id], [{ attribute_id: a.attribute.id, value_id: a.values[0]!.id }]);
      expect((await repo.valuesForWorkItems(ctxA, [item.id])).map(v => v.project_id)).toEqual([projectA]);
    });
  });

  test('an attribute of another project in the organisation is unwritable', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, issueA, alice } = await seedIssueWorld(tx);
      const sibling = await seedSiblingProject(tx, ctxA, alice);
      const foreign = await attributeIn(tx, ctxA, sibling);
      const item = await workItemOn(tx, ctxA, issueA.id, alice);
      expect(
        await failsInSavepoint(tx, sp =>
          workItemAttributesRepository(sp).setValues(
            ctxA,
            [item.id],
            [{ attribute_id: foreign.attribute.id, value_id: foreign.values[0]!.id }],
          ),
        ),
      ).toBe(true);
      expect(await workItemAttributesRepository(tx).valuesForWorkItems(ctxA, [item.id])).toEqual([]);
    });
  });

  test("setValues on another organisation's work item writes nothing", async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, projectB, issueA, alice } = await seedIssueWorld(tx);
      const b = await attributeIn(tx, ctxB, projectB);
      const itemA = await workItemOn(tx, ctxA, issueA.id, alice);
      expect(
        await failsInSavepoint(tx, sp =>
          workItemAttributesRepository(sp).setValues(
            ctxB,
            [itemA.id],
            [{ attribute_id: b.attribute.id, value_id: b.values[0]!.id }],
          ),
        ),
      ).toBe(true);
      expect(await workItemAttributesRepository(tx).valuesForWorkItems(ctxA, [itemA.id])).toEqual([]);
    });
  });
});
