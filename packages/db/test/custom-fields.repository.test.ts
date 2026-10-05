import { describe, expect, test } from 'bun:test';
import { customFieldsRepository } from '../src/repositories/custom-fields.repository.ts';
import { issueSearchRepository } from '../src/repositories/issue-search.repository.ts';
import { projectSchemaRepository } from '../src/repositories/project-schema.repository.ts';
import { schema } from '../src/index.ts';
import type { Queryable } from '../src/client.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld, testDb } from './fixtures.ts';

const at = new Date('2026-09-26T10:00:00Z');

async function fieldIn(tx: Queryable, ctx: TenantContext, projectId: number, userId: number, type = 'select') {
  const repo = customFieldsRepository(tx);
  const field = await repo.insert(ctx, projectId, {
    name: 'Severity',
    slug: 'severity',
    type,
    config: {},
    position: 0,
    created_by: userId,
  });
  const options = await repo.insertOptions(ctx, field.id, [
    { name: 'Low', color: 'gray-2', position: 0 },
    { name: 'High', color: 'red-3', position: 1 },
  ]);
  return { field, options };
}

describe('customFieldsRepository tenant isolation', () => {
  test("fields, options and applies-to are read and written only in the caller's organisation", async () => {
    await inRolledBackTx(async tx => {
      const repo = customFieldsRepository(tx);
      const { ctxA, ctxB, projectA, projectB, alice, bob } = await seedIssueWorld(tx);
      const a = await fieldIn(tx, ctxA, projectA, alice);
      const b = await fieldIn(tx, ctxB, projectB, bob);
      expect(a.field.org_id).toBe(ctxA.orgId);

      expect((await repo.listForProjects(ctxA, [projectA, projectB])).map(f => f.id)).toEqual([a.field.id]);
      expect((await repo.findBySlugAcrossOrg(ctxA, 'SEVERITY')).map(f => f.id)).toEqual([a.field.id]);
      expect(await repo.countLive(ctxA, projectA)).toBe(1);
      expect(await repo.countLive(ctxB, projectA)).toBe(0);

      expect(await repo.update(ctxB, a.field.id, { name: 'Hijacked' })).toBeUndefined();
      expect((await repo.update(ctxA, a.field.id, { name: 'Impact' }))?.name).toBe('Impact');
      await repo.reorder(ctxB, [a.field.id]);
      await repo.update(ctxA, a.field.id, { position: 4 });
      await repo.reorder(ctxB, [a.field.id]);
      expect((await repo.listForProjects(ctxA, [projectA]))[0]?.position).toBe(4);
      await repo.reorder(ctxA, [a.field.id]);
      expect((await repo.listForProjects(ctxA, [projectA]))[0]?.position).toBe(0);

      expect((await repo.listOptions(ctxA, [a.field.id, b.field.id])).map(o => o.id)).toEqual(a.options.map(o => o.id));
      expect(await repo.updateOption(ctxB, a.options[0]!.id, { name: 'X' })).toBeUndefined();
      expect((await repo.updateOption(ctxA, a.options[0]!.id, { name: 'Minor' }))?.name).toBe('Minor');
      await repo.reorderOptions(ctxB, [a.options[1]!.id, a.options[0]!.id]);
      expect((await repo.listOptions(ctxA, [a.field.id]))[0]?.id).toBe(a.options[0]!.id);
      await repo.reorderOptions(ctxA, [a.options[1]!.id, a.options[0]!.id]);
      expect((await repo.listOptions(ctxA, [a.field.id]))[0]?.id).toBe(a.options[1]!.id);

      const [bug] = await projectSchemaRepository(tx).list(ctxA, 'types', projectA);
      await repo.replaceAppliesTo(ctxA, projectA, a.field.id, [bug!.id]);
      expect(await repo.listAppliesTo(ctxA, [a.field.id])).toEqual([{ field_id: a.field.id, type_id: bug!.id }]);
      expect(await repo.listAppliesTo(ctxB, [a.field.id])).toEqual([]);
      await repo.replaceAppliesTo(ctxB, projectB, a.field.id, []);
      expect(await repo.listAppliesTo(ctxA, [a.field.id])).toHaveLength(1);

      expect(await repo.removeOption(ctxB, a.options[0]!.id)).toBe(false);
      expect(await repo.removeOption(ctxA, a.options[0]!.id)).toBe(true);
      expect(await repo.remove(ctxB, a.field.id)).toBe(false);
      expect(await repo.remove(ctxA, a.field.id)).toBe(true);
      expect(await repo.listForProjects(ctxB, [projectB])).toHaveLength(1);
    });
  });

  test("values: listed, replaced, counted and moved only on the caller's issues", async () => {
    await inRolledBackTx(async tx => {
      const repo = customFieldsRepository(tx);
      const { ctxA, ctxB, projectA, projectB, alice, bob, issueA, issueB } = await seedIssueWorld(tx);
      const a = await fieldIn(tx, ctxA, projectA, alice, 'multi_select');
      const b = await fieldIn(tx, ctxB, projectB, bob, 'multi_select');
      const target = { projectId: projectA, issueId: issueA.id, fieldId: a.field.id };
      await repo.replaceValues(ctxA, target, [{ option_id: a.options[0]!.id }, { option_id: a.options[1]!.id }], at);
      await repo.replaceValues(
        ctxB,
        { projectId: projectB, issueId: issueB.id, fieldId: b.field.id },
        [{ option_id: b.options[0]!.id }],
        at,
      );

      expect((await repo.listValues(ctxA, [issueA.id, issueB.id])).map(v => v.option_id)).toEqual(
        a.options.map(o => o.id),
      );
      expect(await repo.listValues(ctxB, [issueA.id])).toEqual([]);
      expect(await repo.issuesWithValue(ctxA, a.field.id)).toEqual([issueA.id]);
      expect(await repo.issuesWithValue(ctxB, a.field.id)).toEqual([]);
      expect(await repo.countIssuesWithValue(ctxA, a.field.id)).toBe(1);
      expect(await repo.countIssuesWithValue(ctxB, a.field.id)).toBe(0);
      expect(await repo.issueCounts(ctxA, [a.field.id, b.field.id])).toEqual(new Map([[a.field.id, 1]]));
      expect(await repo.issueCounts(ctxB, [a.field.id])).toEqual(new Map());

      await repo.replaceValues(ctxB, target, [], at);
      expect(await repo.listValues(ctxA, [issueA.id])).toHaveLength(2);

      await repo.moveOption(ctxB, a.field.id, a.options[0]!.id, a.options[1]!.id);
      expect(await repo.listValues(ctxA, [issueA.id])).toHaveLength(2);
      await repo.moveOption(ctxA, a.field.id, a.options[0]!.id, a.options[1]!.id);
      expect((await repo.listValues(ctxA, [issueA.id])).map(v => v.option_id)).toEqual([a.options[1]!.id]);

      await repo.replaceValues(ctxA, target, [], at);
      expect(await repo.listValues(ctxA, [issueA.id])).toEqual([]);
      expect(await repo.listValues(ctxB, [issueB.id])).toHaveLength(1);
    });
  });

  test("time roles are read and set only on the caller's projects", async () => {
    await inRolledBackTx(async tx => {
      const repo = customFieldsRepository(tx);
      const { ctxA, ctxB, projectA, projectB, alice } = await seedIssueWorld(tx);
      const { field } = await fieldIn(tx, ctxA, projectA, alice, 'duration');
      await repo.setTimeRoles(ctxB, projectA, { estimation_field_id: field.id });
      expect(await repo.timeRoles(ctxA, [projectA])).toEqual([
        { project_id: projectA, estimation_field_id: null, spent_time_field_id: null },
      ]);
      await repo.setTimeRoles(ctxA, projectA, { estimation_field_id: field.id });
      expect((await repo.timeRoles(ctxA, [projectA, projectB]))[0]?.estimation_field_id).toBe(field.id);
      expect(await repo.timeRoles(ctxB, [projectA])).toEqual([]);
    });
  });

  test('the schema makes cross-project and duplicate values unwritable', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, projectA, projectB, alice, bob, issueA } = await seedIssueWorld(tx);
      const a = await fieldIn(tx, ctxA, projectA, alice, 'text');
      expect(
        await failsInSavepoint(tx, sp =>
          customFieldsRepository(sp).insert(ctxA, projectA, {
            name: 'Again',
            slug: 'severity',
            type: 'text',
            config: {},
            position: 1,
            created_by: alice,
          }),
        ),
      ).toBe(true);
      const b = await fieldIn(tx, ctxB, projectB, bob);
      const row = (extra: Partial<typeof schema.issue_field_values.$inferInsert> & { field_id: number }) => ({
        org_id: ctxA.orgId,
        project_id: projectA,
        issue_id: issueA.id,
        ...extra,
      });

      // A field of another project on this issue.
      expect(
        await failsInSavepoint(tx, sp =>
          sp.insert(schema.issue_field_values).values(row({ field_id: b.field.id, value_text: 'x' })),
        ),
      ).toBe(true);
      // An option of another field.
      expect(
        await failsInSavepoint(tx, sp =>
          sp.insert(schema.issue_field_values).values(row({ field_id: a.field.id, option_id: b.options[0]!.id })),
        ),
      ).toBe(true);
      // Two scalar rows for one field: NULLS NOT DISTINCT makes the second collide.
      await tx.insert(schema.issue_field_values).values(row({ field_id: a.field.id, value_text: 'one' }));
      expect(
        await failsInSavepoint(tx, sp =>
          sp.insert(schema.issue_field_values).values(row({ field_id: a.field.id, value_text: 'two' })),
        ),
      ).toBe(true);
      // A row with no value.
      expect(
        await failsInSavepoint(tx, sp => sp.insert(schema.issue_field_values).values(row({ field_id: a.field.id }))),
      ).toBe(true);
    });
  });

  test("search vocabulary and suggestions name only the caller's options", async () => {
    await inRolledBackTx(async tx => {
      const search = issueSearchRepository(tx);
      const { ctxA, ctxB, projectA, projectB, alice, bob } = await seedIssueWorld(tx);
      await fieldIn(tx, ctxA, projectA, alice);
      const b = await fieldIn(tx, ctxB, projectB, bob);
      await customFieldsRepository(tx).updateOption(ctxB, b.options[0]!.id, { name: 'Leaked' });
      const vocab = await search.vocabulary(ctxA, [projectA, projectB], new Set(['severity']), ['severity']);
      expect(vocab.options).toEqual({ severity: ['High', 'Low'] });
      expect(await search.suggestValues(ctxA, [projectA, projectB], 'severity', 'le', 10)).toEqual([]);
      expect(await search.suggestValues(ctxB, [projectB], 'severity', 'le', 10)).toEqual(['Leaked']);
    });
  });
});

describe('customFieldsRepository.lockSlug', () => {
  test('holds the slug for the caller’s organisation only, until the transaction ends', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB } = await seedIssueWorld(tx);
      await customFieldsRepository(tx).lockSlug(ctxA, 'Severity');
      const tryLock = async (orgId: number) =>
        (
          await testDb().pool.query<{ ok: boolean }>(
            'select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as ok',
            [`custom_fields:${orgId}:severity`],
          )
        ).rows[0]!.ok;
      expect(await tryLock(ctxA.orgId)).toBe(false);
      expect(await tryLock(ctxB.orgId)).toBe(true);
    });
  });
});
