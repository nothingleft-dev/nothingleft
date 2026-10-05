import { and, asc, count, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  issues,
  work_items,
  work_types,
  type NewWorkItemRow,
  type WorkItemRow,
  type WorkTypeRow,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export interface WorkItemListed {
  item: WorkItemRow;
  issue_key_number: number;
  work_type: WorkTypeRow | null;
}

export interface WorkItemPage {
  after?: { work_date: string; id: number } | undefined;
  limit: number;
}

export type WorkItemInsert = Omit<NewWorkItemRow, 'id' | 'org_id' | 'project_id'>;
export type WorkItemPatch = Partial<
  Pick<WorkItemRow, 'author_id' | 'work_date' | 'duration_minutes' | 'work_type_id' | 'description_md' | 'updated_at'>
>;

export function workItemsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(work_items.org_id, ctx.orgId);
  const projectOfIssue = (ctx: TenantContext, issueId: number) =>
    sql<number>`(select i.project_id from issues i where i.id = ${issueId} and i.org_id = ${ctx.orgId})`;

  const listed = () =>
    db
      .select({ item: work_items, issue_key_number: issues.key_number, work_type: work_types })
      .from(work_items)
      .innerJoin(issues, and(eq(issues.id, work_items.issue_id), eq(issues.org_id, work_items.org_id)))
      .leftJoin(work_types, and(eq(work_types.id, work_items.work_type_id), eq(work_types.org_id, work_items.org_id)));

  return {
    async insertMany(ctx: TenantContext, rows: WorkItemInsert[]): Promise<WorkItemRow[]> {
      if (rows.length === 0) return [];
      return db
        .insert(work_items)
        .values(rows.map(r => ({ ...r, org_id: ctx.orgId, project_id: projectOfIssue(ctx, r.issue_id) })))
        .returning();
    },

    async findOnIssue(ctx: TenantContext, issueId: number, id: number): Promise<WorkItemListed | undefined> {
      const [row] = await listed()
        .where(and(inOrg(ctx), eq(work_items.issue_id, issueId), eq(work_items.id, id)))
        .limit(1);
      return row;
    },

    async findMany(ctx: TenantContext, ids: number[]): Promise<WorkItemListed[]> {
      if (ids.length === 0) return [];
      return listed()
        .where(and(inOrg(ctx), inArray(work_items.id, [...new Set(ids)])))
        .orderBy(asc(work_items.work_date), asc(work_items.id));
    },

    /** Row-locked, so two edits of one record never lose each other's change. */
    async lockOnIssue(ctx: TenantContext, issueId: number, id: number): Promise<WorkItemRow | undefined> {
      const [row] = await db
        .select()
        .from(work_items)
        .where(and(inOrg(ctx), eq(work_items.issue_id, issueId), eq(work_items.id, id)))
        .for('update');
      return row;
    },

    async update(ctx: TenantContext, id: number, patch: WorkItemPatch): Promise<WorkItemRow | undefined> {
      const [row] = await db
        .update(work_items)
        .set(patch)
        .where(and(inOrg(ctx), eq(work_items.id, id)))
        .returning();
      return row;
    },

    async delete(ctx: TenantContext, id: number): Promise<WorkItemRow | undefined> {
      const [row] = await db
        .delete(work_items)
        .where(and(inOrg(ctx), eq(work_items.id, id)))
        .returning();
      return row;
    },

    // In the order the work happened, then the order it was written; the cursor carries both.
    async list(ctx: TenantContext, issueIds: number[], page: WorkItemPage): Promise<WorkItemListed[]> {
      if (issueIds.length === 0) return [];
      const after = page.after
        ? or(
            gt(work_items.work_date, page.after.work_date),
            and(eq(work_items.work_date, page.after.work_date), gt(work_items.id, page.after.id)),
          )
        : undefined;
      return listed()
        .where(and(inOrg(ctx), inArray(work_items.issue_id, issueIds), after))
        .orderBy(asc(work_items.work_date), asc(work_items.id))
        .limit(page.limit);
    },

    async sumMinutesByAuthor(ctx: TenantContext, userId: number): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`coalesce(sum(${work_items.duration_minutes}), 0)::int` })
        .from(work_items)
        .where(and(inOrg(ctx), eq(work_items.author_id, userId)));
      return row?.n ?? 0;
    },

    async count(ctx: TenantContext, issueIds: number[]): Promise<number> {
      if (issueIds.length === 0) return 0;
      const [row] = await db
        .select({ n: count() })
        .from(work_items)
        .where(and(inOrg(ctx), inArray(work_items.issue_id, issueIds)));
      return row?.n ?? 0;
    },
  };
}

export type WorkItemsRepository = ReturnType<typeof workItemsRepository>;
