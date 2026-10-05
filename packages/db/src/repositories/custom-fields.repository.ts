import { and, asc, count, countDistinct, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  custom_field_applies_to,
  custom_field_options,
  custom_fields,
  issue_field_values,
  projects,
  type CustomFieldOptionRow,
  type CustomFieldRow,
  type IssueFieldValueRow,
  type NewCustomFieldRow,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

type FieldInsert = Omit<NewCustomFieldRow, 'id' | 'org_id' | 'project_id' | 'created_at' | 'updated_at'>;
type FieldPatch = Partial<
  Pick<
    CustomFieldRow,
    'name' | 'config' | 'is_required' | 'default_value' | 'empty_label' | 'position' | 'is_archived' | 'updated_at'
  >
>;
type OptionInsert = Pick<CustomFieldOptionRow, 'name' | 'color' | 'position'>;
type OptionPatch = Partial<Pick<CustomFieldOptionRow, 'name' | 'color' | 'position' | 'is_archived'>>;

/** One stored value; exactly one column is set. */
export type FieldValueInsert = Partial<
  Pick<
    IssueFieldValueRow,
    'value_text' | 'value_number' | 'value_date' | 'value_timestamptz' | 'value_bool' | 'option_id' | 'user_id'
  >
>;

export interface FieldTimeRoles {
  project_id: number;
  estimation_field_id: number | null;
  spent_time_field_id: number | null;
}

export function customFieldsRepository(db: Queryable) {
  return {
    async listForProjects(
      ctx: TenantContext,
      projectIds: readonly number[],
      options: { archived?: boolean } = {},
    ): Promise<CustomFieldRow[]> {
      if (projectIds.length === 0) return [];
      return db
        .select()
        .from(custom_fields)
        .where(
          and(
            eq(custom_fields.org_id, ctx.orgId),
            inArray(custom_fields.project_id, [...new Set(projectIds)]),
            options.archived === undefined ? undefined : eq(custom_fields.is_archived, options.archived),
          ),
        )
        .orderBy(asc(custom_fields.project_id), asc(custom_fields.position), asc(custom_fields.id));
    },

    /** Every field in the organisation with this slug, whatever the project, for the one-kind rule. */
    async findBySlugAcrossOrg(ctx: TenantContext, slug: string): Promise<CustomFieldRow[]> {
      return db
        .select()
        .from(custom_fields)
        .where(and(eq(custom_fields.org_id, ctx.orgId), eq(custom_fields.slug, slug.toLowerCase())));
    },

    /** Serialises the one-kind-per-slug check across the organisation's projects until the transaction ends. */
    async lockSlug(ctx: TenantContext, slug: string): Promise<void> {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`custom_fields:${ctx.orgId}:${slug.toLowerCase()}`}, 0))`,
      );
    },

    async countLive(ctx: TenantContext, projectId: number): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(custom_fields)
        .where(
          and(
            eq(custom_fields.org_id, ctx.orgId),
            eq(custom_fields.project_id, projectId),
            eq(custom_fields.is_archived, false),
          ),
        );
      return row?.n ?? 0;
    },

    async insert(ctx: TenantContext, projectId: number, input: FieldInsert): Promise<CustomFieldRow> {
      const [row] = await db
        .insert(custom_fields)
        .values({ ...input, org_id: ctx.orgId, project_id: projectId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async update(ctx: TenantContext, id: number, patch: FieldPatch): Promise<CustomFieldRow | undefined> {
      const [row] = await db
        .update(custom_fields)
        .set(patch)
        .where(and(eq(custom_fields.org_id, ctx.orgId), eq(custom_fields.id, id)))
        .returning();
      return row;
    },

    async remove(ctx: TenantContext, id: number): Promise<boolean> {
      const rows = await db
        .delete(custom_fields)
        .where(and(eq(custom_fields.org_id, ctx.orgId), eq(custom_fields.id, id)))
        .returning({ id: custom_fields.id });
      return rows.length > 0;
    },

    async reorder(ctx: TenantContext, orderedIds: readonly number[]): Promise<void> {
      for (const [position, id] of orderedIds.entries()) {
        await db
          .update(custom_fields)
          .set({ position })
          .where(and(eq(custom_fields.org_id, ctx.orgId), eq(custom_fields.id, id)));
      }
    },

    async timeRoles(ctx: TenantContext, projectIds: readonly number[]): Promise<FieldTimeRoles[]> {
      if (projectIds.length === 0) return [];
      return db
        .select({
          project_id: projects.id,
          estimation_field_id: projects.estimation_field_id,
          spent_time_field_id: projects.spent_time_field_id,
        })
        .from(projects)
        .where(and(eq(projects.org_id, ctx.orgId), inArray(projects.id, [...new Set(projectIds)])));
    },

    async setTimeRoles(
      ctx: TenantContext,
      projectId: number,
      patch: Partial<Pick<FieldTimeRoles, 'estimation_field_id' | 'spent_time_field_id'>>,
    ): Promise<void> {
      await db
        .update(projects)
        .set(patch)
        .where(and(eq(projects.org_id, ctx.orgId), eq(projects.id, projectId)));
    },

    async listAppliesTo(
      ctx: TenantContext,
      fieldIds: readonly number[],
    ): Promise<{ field_id: number; type_id: number }[]> {
      if (fieldIds.length === 0) return [];
      return db
        .select({ field_id: custom_field_applies_to.field_id, type_id: custom_field_applies_to.type_id })
        .from(custom_field_applies_to)
        .where(
          and(
            eq(custom_field_applies_to.org_id, ctx.orgId),
            inArray(custom_field_applies_to.field_id, [...new Set(fieldIds)]),
          ),
        );
    },

    async replaceAppliesTo(
      ctx: TenantContext,
      projectId: number,
      fieldId: number,
      typeIds: readonly number[],
    ): Promise<void> {
      await db
        .delete(custom_field_applies_to)
        .where(and(eq(custom_field_applies_to.org_id, ctx.orgId), eq(custom_field_applies_to.field_id, fieldId)));
      if (typeIds.length === 0) return;
      await db.insert(custom_field_applies_to).values(
        [...new Set(typeIds)].map(type_id => ({
          field_id: fieldId,
          type_id,
          project_id: projectId,
          org_id: ctx.orgId,
        })),
      );
    },

    async listOptions(ctx: TenantContext, fieldIds: readonly number[]): Promise<CustomFieldOptionRow[]> {
      if (fieldIds.length === 0) return [];
      return db
        .select()
        .from(custom_field_options)
        .where(
          and(
            eq(custom_field_options.org_id, ctx.orgId),
            inArray(custom_field_options.field_id, [...new Set(fieldIds)]),
          ),
        )
        .orderBy(asc(custom_field_options.position), asc(custom_field_options.id));
    },

    async insertOptions(
      ctx: TenantContext,
      fieldId: number,
      options: readonly OptionInsert[],
    ): Promise<CustomFieldOptionRow[]> {
      if (options.length === 0) return [];
      return db
        .insert(custom_field_options)
        .values(options.map(o => ({ ...o, field_id: fieldId, org_id: ctx.orgId })))
        .returning();
    },

    async updateOption(ctx: TenantContext, id: number, patch: OptionPatch): Promise<CustomFieldOptionRow | undefined> {
      const [row] = await db
        .update(custom_field_options)
        .set(patch)
        .where(and(eq(custom_field_options.org_id, ctx.orgId), eq(custom_field_options.id, id)))
        .returning();
      return row;
    },

    async removeOption(ctx: TenantContext, id: number): Promise<boolean> {
      const rows = await db
        .delete(custom_field_options)
        .where(and(eq(custom_field_options.org_id, ctx.orgId), eq(custom_field_options.id, id)))
        .returning({ id: custom_field_options.id });
      return rows.length > 0;
    },

    async reorderOptions(ctx: TenantContext, orderedIds: readonly number[]): Promise<void> {
      for (const [position, id] of orderedIds.entries()) {
        await db
          .update(custom_field_options)
          .set({ position })
          .where(and(eq(custom_field_options.org_id, ctx.orgId), eq(custom_field_options.id, id)));
      }
    },

    /** Issues holding a value of the field (or of one option), soft-deleted ones included. */
    async issuesWithValue(ctx: TenantContext, fieldId: number, optionId?: number): Promise<number[]> {
      const rows = await db
        .selectDistinct({ issue_id: issue_field_values.issue_id })
        .from(issue_field_values)
        .where(
          and(
            eq(issue_field_values.org_id, ctx.orgId),
            eq(issue_field_values.field_id, fieldId),
            optionId === undefined ? undefined : eq(issue_field_values.option_id, optionId),
          ),
        );
      return rows.map(r => r.issue_id);
    },

    async countIssuesWithValue(ctx: TenantContext, fieldId: number): Promise<number> {
      const [row] = await db
        .select({ n: countDistinct(issue_field_values.issue_id) })
        .from(issue_field_values)
        .where(and(eq(issue_field_values.org_id, ctx.orgId), eq(issue_field_values.field_id, fieldId)));
      return row?.n ?? 0;
    },

    async issueCounts(ctx: TenantContext, fieldIds: readonly number[]): Promise<Map<number, number>> {
      if (fieldIds.length === 0) return new Map();
      const rows = await db
        .select({ field_id: issue_field_values.field_id, n: countDistinct(issue_field_values.issue_id) })
        .from(issue_field_values)
        .where(
          and(eq(issue_field_values.org_id, ctx.orgId), inArray(issue_field_values.field_id, [...new Set(fieldIds)])),
        )
        .groupBy(issue_field_values.field_id);
      return new Map(rows.map(r => [r.field_id, Number(r.n)]));
    },

    async listValues(ctx: TenantContext, issueIds: readonly number[]): Promise<IssueFieldValueRow[]> {
      if (issueIds.length === 0) return [];
      return db
        .select()
        .from(issue_field_values)
        .where(
          and(eq(issue_field_values.org_id, ctx.orgId), inArray(issue_field_values.issue_id, [...new Set(issueIds)])),
        )
        .orderBy(asc(issue_field_values.id));
    },

    /** Replaces one field's values on one issue; an empty list clears it. */
    async replaceValues(
      ctx: TenantContext,
      target: { projectId: number; issueId: number; fieldId: number },
      values: readonly FieldValueInsert[],
      at: Date,
    ): Promise<void> {
      await db
        .delete(issue_field_values)
        .where(
          and(
            eq(issue_field_values.org_id, ctx.orgId),
            eq(issue_field_values.issue_id, target.issueId),
            eq(issue_field_values.field_id, target.fieldId),
          ),
        );
      if (values.length === 0) return;
      await db.insert(issue_field_values).values(
        values.map(v => ({
          ...v,
          org_id: ctx.orgId,
          project_id: target.projectId,
          issue_id: target.issueId,
          field_id: target.fieldId,
          created_at: at,
          updated_at: at,
        })),
      );
    },

    /** Re-points one option's values at another; an issue that already has the target keeps one row. */
    async moveOption(ctx: TenantContext, fieldId: number, fromId: number, toId: number): Promise<void> {
      const scope = and(eq(issue_field_values.org_id, ctx.orgId), eq(issue_field_values.field_id, fieldId));
      await db.delete(issue_field_values).where(
        and(
          scope,
          eq(issue_field_values.option_id, fromId),
          inArray(
            issue_field_values.issue_id,
            db
              .select({ id: sql<number>`t.issue_id` })
              .from(sql`issue_field_values t`)
              .where(sql`t.org_id = ${ctx.orgId} and t.field_id = ${fieldId} and t.option_id = ${toId}`),
          ),
        ),
      );
      await db
        .update(issue_field_values)
        .set({ option_id: toId })
        .where(and(scope, eq(issue_field_values.option_id, fromId), ne(issue_field_values.option_id, toId)));
    },
  };
}

export type CustomFieldsRepository = ReturnType<typeof customFieldsRepository>;
