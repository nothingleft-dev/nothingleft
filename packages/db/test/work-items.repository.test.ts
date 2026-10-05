import { describe, expect, test } from 'bun:test';
import type { TenantContext } from '../src/tenant-context.ts';
import type { Queryable } from '../src/client.ts';
import type { IssueRow } from '../src/schema/index.ts';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { organizationPurgeRepository } from '../src/repositories/organization-purge.repository.ts';
import { projectSchemaRepository } from '../src/repositories/project-schema.repository.ts';
import { workItemAttributesRepository } from '../src/repositories/work-item-attributes.repository.ts';
import { workItemsRepository } from '../src/repositories/work-items.repository.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld, seedSiblingProject } from './fixtures.ts';

const logged = (issue: IssueRow, userId: number, work_date: string, duration_minutes: number) => ({
  issue_id: issue.id,
  author_id: userId,
  created_by: userId,
  work_date,
  duration_minutes,
  description_md: '',
});

async function childOf(tx: Queryable, ctx: TenantContext, parent: IssueRow, keyNumber: number): Promise<IssueRow> {
  return issuesRepository(tx).insert(ctx, {
    project_id: parent.project_id,
    key_number: keyNumber,
    title: `Child ${keyNumber}`,
    status_id: parent.status_id,
    priority_id: parent.priority_id,
    type_id: parent.type_id,
    created_by: parent.created_by,
    updated_by: parent.created_by,
    parent_id: parent.id,
  });
}

describe('workItemsRepository tenant isolation', () => {
  test('insertMany refuses another organisation’s issue and work type', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, alice, bob, issueA, issueB, projectB } = await seedIssueWorld(tx);
      expect(
        await failsInSavepoint(tx, sp =>
          workItemsRepository(sp).insertMany(ctxB, [logged(issueA, bob, '2026-09-21', 60)]),
        ),
      ).toBe(true);
      const [otherType] = await projectSchemaRepository(tx).list(ctxB, 'work_types', projectB);
      expect(
        await failsInSavepoint(tx, sp =>
          workItemsRepository(sp).insertMany(ctxA, [
            { ...logged(issueA, alice, '2026-09-21', 60), work_type_id: otherType!.id },
          ]),
        ),
      ).toBe(true);
      expect(await workItemsRepository(tx).insertMany(ctxB, [logged(issueB, bob, '2026-09-21', 60)])).toHaveLength(1);
    });
  });

  test('find, findMany, lock, list, count, update and delete answer only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = workItemsRepository(tx);
      const { ctxA, ctxB, alice, issueA, projectA } = await seedIssueWorld(tx);
      const [development] = await projectSchemaRepository(tx).list(ctxA, 'work_types', projectA);
      const [later, earlier, sameDay] = await repo.insertMany(ctxA, [
        { ...logged(issueA, alice, '2026-09-22', 60), work_type_id: development!.id },
        logged(issueA, alice, '2026-09-21', 30),
        logged(issueA, alice, '2026-09-22', 15),
      ]);

      expect((await repo.findOnIssue(ctxA, issueA.id, later!.id))?.work_type?.name).toBe(development!.name);
      expect((await repo.findOnIssue(ctxA, issueA.id, later!.id))?.issue_key_number).toBe(issueA.key_number);
      expect(await repo.findOnIssue(ctxB, issueA.id, later!.id)).toBeUndefined();
      expect(await repo.findMany(ctxB, [later!.id])).toEqual([]);
      expect(await repo.lockOnIssue(ctxB, issueA.id, later!.id)).toBeUndefined();

      const order = (await repo.list(ctxA, [issueA.id], { limit: 10 })).map(r => r.item.id);
      expect(order).toEqual([earlier!.id, later!.id, sameDay!.id]);
      const afterEarlier = await repo.list(ctxA, [issueA.id], {
        after: { work_date: earlier!.work_date, id: earlier!.id },
        limit: 10,
      });
      expect(afterEarlier.map(r => r.item.id)).toEqual([later!.id, sameDay!.id]);
      expect(await repo.list(ctxB, [issueA.id], { limit: 10 })).toEqual([]);
      expect(await repo.count(ctxA, [issueA.id])).toBe(3);
      expect(await repo.count(ctxB, [issueA.id])).toBe(0);

      expect(await repo.update(ctxB, later!.id, { duration_minutes: 999 })).toBeUndefined();
      expect(await repo.delete(ctxB, later!.id)).toBeUndefined();
      expect((await repo.update(ctxA, later!.id, { duration_minutes: 90 }))?.duration_minutes).toBe(90);
      expect((await repo.delete(ctxA, later!.id))?.id).toBe(later!.id);
      expect(await repo.count(ctxA, [issueA.id])).toBe(2);
    });
  });
});

describe('the spent-time rollup', () => {
  test('sums each issue’s live subtree and its ancestors, and only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = workItemsRepository(tx);
      const issues = issuesRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const child = await childOf(tx, ctxA, issueA, 2);
      const grandchild = await childOf(tx, ctxA, child, 3);
      await repo.insertMany(ctxA, [
        logged(issueA, alice, '2026-09-21', 10),
        logged(child, alice, '2026-09-21', 20),
        logged(grandchild, alice, '2026-09-21', 40),
      ]);
      const spent = async (row: IssueRow, ctx = ctxA) => (await issues.findById(ctx, row.id))?.spent_minutes;

      await issues.refreshSpentRollup(ctxB, [grandchild.id]);
      expect(await spent(issueA)).toBe(0);

      await issues.refreshSpentRollup(ctxA, [grandchild.id]);
      expect([await spent(issueA), await spent(child), await spent(grandchild)]).toEqual([70, 60, 40]);
      expect(await issues.liveSubtreeIds(ctxA, issueA.id)).toEqual([issueA.id, child.id, grandchild.id]);
      expect(await issues.liveSubtreeIds(ctxB, issueA.id)).toEqual([issueA.id]);

      await issues.update(ctxA, child.id, { deleted_at: new Date() });
      await issues.refreshSpentRollup(ctxA, [issueA.id]);
      expect(await spent(issueA)).toBe(10);
      expect(await issues.liveSubtreeIds(ctxA, issueA.id)).toEqual([issueA.id]);
    });
  });
});

describe('workItemsRepository removal counts', () => {
  test('sumMinutesByAuthor sums one organisation only', async () => {
    await inRolledBackTx(async tx => {
      const repo = workItemsRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      await repo.insertMany(ctxA, [logged(issueA, alice, '2026-09-21', 60), logged(issueA, alice, '2026-09-22', 90)]);
      expect(await repo.sumMinutesByAuthor(ctxA, alice)).toBe(150);
      expect(await repo.sumMinutesByAuthor(ctxB, alice)).toBe(0);
    });
  });
});

describe('work items are bound to their issue’s project', () => {
  test('insertMany writes the issue’s project on every row', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, alice, issueA, projectA } = await seedIssueWorld(tx);
      const rows = await workItemsRepository(tx).insertMany(ctxA, [
        logged(issueA, alice, '2026-09-21', 60),
        logged(issueA, alice, '2026-09-22', 60),
      ]);
      expect(rows.map(r => r.project_id)).toEqual([projectA, projectA]);
    });
  });

  test('a work type of another project in the organisation is unwritable', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, alice, issueA } = await seedIssueWorld(tx);
      const sibling = await seedSiblingProject(tx, ctxA, alice);
      const [foreignType] = await projectSchemaRepository(tx).list(ctxA, 'work_types', sibling);
      expect(
        await failsInSavepoint(tx, sp =>
          workItemsRepository(sp).insertMany(ctxA, [
            { ...logged(issueA, alice, '2026-09-21', 60), work_type_id: foreignType!.id },
          ]),
        ),
      ).toBe(true);
      const [item] = await workItemsRepository(tx).insertMany(ctxA, [logged(issueA, alice, '2026-09-21', 60)]);
      expect(
        await failsInSavepoint(tx, sp =>
          workItemsRepository(sp).update(ctxA, item!.id, { work_type_id: foreignType!.id }),
        ),
      ).toBe(true);
    });
  });
});

describe('deleting and re-pointing over the project keys', () => {
  async function loggedWithValues(tx: Queryable, ctx: TenantContext, issue: IssueRow, userId: number) {
    const [workType] = await projectSchemaRepository(tx).list(ctx, 'work_types', issue.project_id);
    const attributes = workItemAttributesRepository(tx);
    const attribute = await attributes.insert(ctx, issue.project_id, { name: 'Billable', position: 0 });
    const [yes] = await attributes.insertValues(ctx, attribute.id, [{ name: 'Yes', short_label: 'Y', position: 0 }]);
    const [item] = await workItemsRepository(tx).insertMany(ctx, [
      { ...logged(issue, userId, '2026-09-21', 60), work_type_id: workType!.id },
    ]);
    await attributes.setValues(ctx, [item!.id], [{ attribute_id: attribute.id, value_id: yes!.id }]);
    return item!;
  }

  test('purging an expired issue takes its work items and their values', async () => {
    await inRolledBackTx(async tx => {
      const issues = issuesRepository(tx);
      const { ctxA, alice, issueA } = await seedIssueWorld(tx);
      const item = await loggedWithValues(tx, ctxA, issueA, alice);
      await issues.update(ctxA, issueA.id, { deleted_at: new Date(Date.now() - 20 * 86_400_000) });

      expect(await issues.purgeDeletedBefore(ctxA, new Date(Date.now() - 14 * 86_400_000))).toBe(1);
      expect(await workItemsRepository(tx).findMany(ctxA, [item.id])).toEqual([]);
      expect(await workItemAttributesRepository(tx).valuesForWorkItems(ctxA, [item.id])).toEqual([]);
    });
  });

  test('purging an organisation with logged time succeeds and leaves none', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, alice, bob, issueA, issueB } = await seedIssueWorld(tx);
      const itemA = await loggedWithValues(tx, ctxA, issueA, alice);
      const itemB = await loggedWithValues(tx, ctxB, issueB, bob);

      await organizationPurgeRepository(tx).purgeContents(ctxA);
      expect(await workItemsRepository(tx).findMany(ctxA, [itemA.id])).toEqual([]);
      expect(await workItemAttributesRepository(tx).valuesForWorkItems(ctxA, [itemA.id])).toEqual([]);
      expect(await workItemsRepository(tx).findMany(ctxB, [itemB.id])).toHaveLength(1);
    });
  });

  test('a work type delete re-points within the project and refuses another project’s type', async () => {
    await inRolledBackTx(async tx => {
      const schema = projectSchemaRepository(tx);
      const { ctxA, alice, issueA, projectA } = await seedIssueWorld(tx);
      const item = await loggedWithValues(tx, ctxA, issueA, alice);
      const [from, to] = await schema.list(ctxA, 'work_types', projectA);
      const sibling = await seedSiblingProject(tx, ctxA, alice);
      const [foreign] = await schema.list(ctxA, 'work_types', sibling);

      expect(
        await failsInSavepoint(tx, sp =>
          projectSchemaRepository(sp).reassign(ctxA, 'work_types', from!.id, foreign!.id),
        ),
      ).toBe(true);
      expect(await schema.reassign(ctxA, 'work_types', from!.id, to!.id)).toEqual([item.id]);
      expect(await schema.remove(ctxA, 'work_types', from!.id)).toBe(true);
      expect((await workItemsRepository(tx).findMany(ctxA, [item.id]))[0]?.item.work_type_id).toBe(to!.id);
    });
  });
});
