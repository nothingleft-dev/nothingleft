import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  work_item_attribute_values,
  work_item_attributes,
  work_item_values,
  type WorkItemAttributeRow,
  type WorkItemAttributeValueRow,
  type WorkItemValueRow,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

type AttributePatch = Partial<Pick<WorkItemAttributeRow, 'name' | 'position' | 'is_archived' | 'updated_at'>>;
type ValueInsert = Pick<WorkItemAttributeValueRow, 'name' | 'short_label' | 'position'>;
type ValuePatch = Partial<Pick<WorkItemAttributeValueRow, 'name' | 'short_label' | 'position' | 'is_archived'>>;

export function workItemAttributesRepository(db: Queryable) {
  const projectOfWorkItem = (ctx: TenantContext, workItemId: number) =>
    sql<number>`(select w.project_id from work_items w where w.id = ${workItemId} and w.org_id = ${ctx.orgId})`;

  return {
    async listForProjects(ctx: TenantContext, projectIds: readonly number[]): Promise<WorkItemAttributeRow[]> {
      if (projectIds.length === 0) return [];
      return db
        .select()
        .from(work_item_attributes)
        .where(
          and(
            eq(work_item_attributes.org_id, ctx.orgId),
            inArray(work_item_attributes.project_id, [...new Set(projectIds)]),
          ),
        )
        .orderBy(asc(work_item_attributes.position), asc(work_item_attributes.id));
    },

    async listValues(ctx: TenantContext, attributeIds: readonly number[]): Promise<WorkItemAttributeValueRow[]> {
      if (attributeIds.length === 0) return [];
      return db
        .select()
        .from(work_item_attribute_values)
        .where(
          and(
            eq(work_item_attribute_values.org_id, ctx.orgId),
            inArray(work_item_attribute_values.attribute_id, [...new Set(attributeIds)]),
          ),
        )
        .orderBy(asc(work_item_attribute_values.position), asc(work_item_attribute_values.id));
    },

    async insert(
      ctx: TenantContext,
      projectId: number,
      input: Pick<WorkItemAttributeRow, 'name' | 'position'>,
    ): Promise<WorkItemAttributeRow> {
      const [row] = await db
        .insert(work_item_attributes)
        .values({ ...input, org_id: ctx.orgId, project_id: projectId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async update(ctx: TenantContext, id: number, patch: AttributePatch): Promise<WorkItemAttributeRow | undefined> {
      const [row] = await db
        .update(work_item_attributes)
        .set(patch)
        .where(and(eq(work_item_attributes.org_id, ctx.orgId), eq(work_item_attributes.id, id)))
        .returning();
      return row;
    },

    async remove(ctx: TenantContext, id: number): Promise<boolean> {
      await db
        .delete(work_item_values)
        .where(and(eq(work_item_values.org_id, ctx.orgId), eq(work_item_values.attribute_id, id)));
      const rows = await db
        .delete(work_item_attributes)
        .where(and(eq(work_item_attributes.org_id, ctx.orgId), eq(work_item_attributes.id, id)))
        .returning({ id: work_item_attributes.id });
      return rows.length > 0;
    },

    async reorder(ctx: TenantContext, orderedIds: readonly number[]): Promise<void> {
      for (const [position, id] of orderedIds.entries()) {
        await db
          .update(work_item_attributes)
          .set({ position })
          .where(and(eq(work_item_attributes.org_id, ctx.orgId), eq(work_item_attributes.id, id)));
      }
    },

    async insertValues(
      ctx: TenantContext,
      attributeId: number,
      values: readonly ValueInsert[],
    ): Promise<WorkItemAttributeValueRow[]> {
      if (values.length === 0) return [];
      return db
        .insert(work_item_attribute_values)
        .values(values.map(v => ({ ...v, attribute_id: attributeId, org_id: ctx.orgId })))
        .returning();
    },

    async updateValue(
      ctx: TenantContext,
      id: number,
      patch: ValuePatch,
    ): Promise<WorkItemAttributeValueRow | undefined> {
      const [row] = await db
        .update(work_item_attribute_values)
        .set(patch)
        .where(and(eq(work_item_attribute_values.org_id, ctx.orgId), eq(work_item_attribute_values.id, id)))
        .returning();
      return row;
    },

    async removeValue(ctx: TenantContext, id: number): Promise<boolean> {
      const rows = await db
        .delete(work_item_attribute_values)
        .where(and(eq(work_item_attribute_values.org_id, ctx.orgId), eq(work_item_attribute_values.id, id)))
        .returning({ id: work_item_attribute_values.id });
      return rows.length > 0;
    },

    async reorderValues(ctx: TenantContext, orderedIds: readonly number[]): Promise<void> {
      for (const [position, id] of orderedIds.entries()) {
        await db
          .update(work_item_attribute_values)
          .set({ position })
          .where(and(eq(work_item_attribute_values.org_id, ctx.orgId), eq(work_item_attribute_values.id, id)));
      }
    },

    async countValueUsage(ctx: TenantContext, valueId: number): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(work_item_values)
        .where(and(eq(work_item_values.org_id, ctx.orgId), eq(work_item_values.value_id, valueId)));
      return row?.n ?? 0;
    },

    async countAttributeUsage(ctx: TenantContext, attributeId: number): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(work_item_values)
        .where(and(eq(work_item_values.org_id, ctx.orgId), eq(work_item_values.attribute_id, attributeId)));
      return row?.n ?? 0;
    },

    async moveValue(ctx: TenantContext, fromId: number, toId: number): Promise<number> {
      const rows = await db
        .update(work_item_values)
        .set({ value_id: toId })
        .where(and(eq(work_item_values.org_id, ctx.orgId), eq(work_item_values.value_id, fromId)))
        .returning({ id: work_item_values.work_item_id });
      return rows.length;
    },

    async valuesForWorkItems(ctx: TenantContext, workItemIds: readonly number[]): Promise<WorkItemValueRow[]> {
      if (workItemIds.length === 0) return [];
      return db
        .select()
        .from(work_item_values)
        .where(
          and(
            eq(work_item_values.org_id, ctx.orgId),
            inArray(work_item_values.work_item_id, [...new Set(workItemIds)]),
          ),
        );
    },

    /** Sets or clears one value per named attribute on each work item. */
    async setValues(
      ctx: TenantContext,
      workItemIds: readonly number[],
      values: readonly { attribute_id: number; value_id: number | null }[],
    ): Promise<void> {
      if (workItemIds.length === 0 || values.length === 0) return;
      const ids = [...new Set(workItemIds)];
      await db.delete(work_item_values).where(
        and(
          eq(work_item_values.org_id, ctx.orgId),
          inArray(work_item_values.work_item_id, ids),
          inArray(
            work_item_values.attribute_id,
            values.map(v => v.attribute_id),
          ),
        ),
      );
      const rows = ids.flatMap(work_item_id =>
        values.flatMap(v =>
          v.value_id === null
            ? []
            : [
                {
                  work_item_id,
                  attribute_id: v.attribute_id,
                  value_id: v.value_id,
                  org_id: ctx.orgId,
                  project_id: projectOfWorkItem(ctx, work_item_id),
                },
              ],
        ),
      );
      if (rows.length > 0) await db.insert(work_item_values).values(rows);
    },
  };
}

export type WorkItemAttributesRepository = ReturnType<typeof workItemAttributesRepository>;
