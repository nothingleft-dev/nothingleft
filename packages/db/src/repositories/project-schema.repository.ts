import { and, asc, count, eq, inArray } from 'drizzle-orm';
import {
  SEED_ISSUE_TYPES,
  SEED_PRIORITIES,
  SEED_STATUSES,
  SEED_WORK_TYPES,
  type ProjectSchemaTable,
} from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import {
  issue_types,
  issues,
  priorities,
  work_items,
  work_types,
  workflow_statuses,
  type IssueTypeRow,
  type PriorityRow,
  type WorkTypeRow,
  type WorkflowStatusRow,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export interface SchemaRows {
  statuses: WorkflowStatusRow;
  priorities: PriorityRow;
  types: IssueTypeRow;
  work_types: WorkTypeRow;
}

export type SchemaRow = SchemaRows[ProjectSchemaTable];

type Insert<T extends ProjectSchemaTable> = Omit<SchemaRows[T], 'id' | 'org_id' | 'project_id'>;
type Patch<T extends ProjectSchemaTable> = Partial<Insert<T>>;

const TABLES = {
  statuses: workflow_statuses,
  priorities,
  types: issue_types,
  work_types,
} as const;

// Which column of which table points at a value — what a delete must re-point first.
const USAGE = {
  statuses: { table: issues, column: issues.status_id, org: issues.org_id, id: issues.id },
  priorities: { table: issues, column: issues.priority_id, org: issues.org_id, id: issues.id },
  types: { table: issues, column: issues.type_id, org: issues.org_id, id: issues.id },
  work_types: { table: work_items, column: work_items.work_type_id, org: work_items.org_id, id: work_items.id },
} as const;

/** statuses, priorities, issue types and work types: one shape, one repository. */
export function projectSchemaRepository(db: Queryable) {
  // The four tables share the columns used here; Drizzle cannot express that union, so one cast.
  const tableOf = (name: ProjectSchemaTable) => TABLES[name] as typeof workflow_statuses;
  const scoped = (ctx: TenantContext, name: ProjectSchemaTable, projectId: number) => {
    const t = tableOf(name);
    return and(eq(t.org_id, ctx.orgId), eq(t.project_id, projectId));
  };

  return {
    async list<T extends ProjectSchemaTable>(ctx: TenantContext, name: T, projectId: number): Promise<SchemaRows[T][]> {
      const t = tableOf(name);
      const rows = await db
        .select()
        .from(t)
        .where(scoped(ctx, name, projectId))
        .orderBy(asc(t.position), asc(t.id));
      return rows as unknown as SchemaRows[T][];
    },

    async listForProjects<T extends ProjectSchemaTable>(
      ctx: TenantContext,
      name: T,
      projectIds: number[],
    ): Promise<SchemaRows[T][]> {
      if (projectIds.length === 0) return [];
      const t = tableOf(name);
      const rows = await db
        .select()
        .from(t)
        .where(and(eq(t.org_id, ctx.orgId), inArray(t.project_id, [...new Set(projectIds)])))
        .orderBy(asc(t.position), asc(t.id));
      return rows as unknown as SchemaRows[T][];
    },

    async insert<T extends ProjectSchemaTable>(
      ctx: TenantContext,
      name: T,
      projectId: number,
      input: Insert<T>,
    ): Promise<SchemaRows[T]> {
      const [row] = await db
        .insert(tableOf(name))
        .values({ ...(input as object), org_id: ctx.orgId, project_id: projectId } as never)
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row as unknown as SchemaRows[T];
    },

    async update<T extends ProjectSchemaTable>(
      ctx: TenantContext,
      name: T,
      id: number,
      patch: Patch<T>,
    ): Promise<SchemaRows[T] | undefined> {
      const t = tableOf(name);
      const [row] = await db
        .update(t)
        .set(patch as never)
        .where(and(eq(t.org_id, ctx.orgId), eq(t.id, id)))
        .returning();
      return row as unknown as SchemaRows[T] | undefined;
    },

    async remove(ctx: TenantContext, name: ProjectSchemaTable, id: number): Promise<boolean> {
      const t = tableOf(name);
      const rows = await db
        .delete(t)
        .where(and(eq(t.org_id, ctx.orgId), eq(t.id, id)))
        .returning({ id: t.id });
      return rows.length > 0;
    },

    async clearDefault(ctx: TenantContext, name: ProjectSchemaTable, projectId: number) {
      await db
        .update(tableOf(name))
        .set({ is_default: false })
        .where(scoped(ctx, name, projectId));
    },

    async reorder(ctx: TenantContext, name: ProjectSchemaTable, orderedIds: number[]): Promise<void> {
      const t = tableOf(name);
      for (const [position, id] of orderedIds.entries()) {
        await db
          .update(t)
          .set({ position })
          .where(and(eq(t.org_id, ctx.orgId), eq(t.id, id)));
      }
    },

    /** Soft-deleted issues count: the foreign key still points at the value. */
    async countUsage(ctx: TenantContext, name: ProjectSchemaTable, id: number): Promise<number> {
      const u = USAGE[name];
      const [row] = await db
        .select({ n: count() })
        .from(u.table)
        .where(and(eq(u.org, ctx.orgId), eq(u.column, id)));
      return row?.n ?? 0;
    },

    async reassign(ctx: TenantContext, name: ProjectSchemaTable, fromId: number, toId: number): Promise<number[]> {
      const u = USAGE[name];
      const rows = await db
        .update(u.table)
        .set({ [u.column.name]: toId } as never)
        .where(and(eq(u.org, ctx.orgId), eq(u.column, fromId)))
        .returning({ id: u.id });
      return rows.map(r => r.id);
    },

    async seed(ctx: TenantContext, projectId: number): Promise<void> {
      const base = { org_id: ctx.orgId, project_id: projectId };
      await db.insert(workflow_statuses).values(
        SEED_STATUSES.map((s, position) => ({
          ...base,
          name: s.name,
          category: s.category,
          color: s.color,
          short_label: s.short_label,
          position,
          is_default: s.is_default === true,
        })),
      );
      await db.insert(priorities).values(
        SEED_PRIORITIES.map((p, position) => ({
          ...base,
          name: p.name,
          color: p.color,
          short_label: p.short_label,
          position,
          is_default: p.is_default === true,
        })),
      );
      await db.insert(issue_types).values(
        SEED_ISSUE_TYPES.map((p, position) => ({
          ...base,
          name: p.name,
          color: p.color,
          short_label: p.short_label,
          position,
          is_default: p.is_default === true,
        })),
      );
      await db.insert(work_types).values(
        SEED_WORK_TYPES.map((w, position) => ({
          ...base,
          name: w.name,
          short_label: w.short_label,
          position,
          is_default: w.is_default === true,
        })),
      );
    },

    async findByIds<T extends ProjectSchemaTable>(
      ctx: TenantContext,
      name: T,
      ids: number[],
    ): Promise<SchemaRows[T][]> {
      if (ids.length === 0) return [];
      const t = tableOf(name);
      const rows = await db
        .select()
        .from(t)
        .where(and(eq(t.org_id, ctx.orgId), inArray(t.id, ids)));
      return rows as unknown as SchemaRows[T][];
    },
  };
}

export type ProjectSchemaRepository = ReturnType<typeof projectSchemaRepository>;
