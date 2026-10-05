import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  issue_activity,
  org_members,
  users,
  type IssueActivityRow,
  type NewIssueActivityRow,
  type OrgMemberRow,
  type UserRow,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export interface IssueActivityPage {
  afterId?: number | undefined;
  limit: number;
}

export interface IssueActivityFilter {
  kinds?: string[] | undefined;
}

export interface IssueActivityWithActor {
  activity: IssueActivityRow;
  actor: UserRow;
  actor_membership: OrgMemberRow | null;
}

// Rows are rewritten only by coalescing inside its window; the service is the one caller.
export function issueActivityRepository(db: Queryable) {
  const onIssue = (ctx: TenantContext, issueId: number) =>
    and(eq(issue_activity.org_id, ctx.orgId), eq(issue_activity.issue_id, issueId));

  // A deleted comment vanishes with its entries; only the comment_deleted row stays.
  const visible = (ctx: TenantContext, issueId: number, filter: IssueActivityFilter) =>
    and(
      onIssue(ctx, issueId),
      filter.kinds ? inArray(issue_activity.kind, filter.kinds) : undefined,
      sql`not (${issue_activity.kind} in ('commented', 'comment_edited') and exists (
        select 1 from comments c where c.org_id = ${issue_activity.org_id}
        and c.id = (${issue_activity.new_value} ->> 'comment_id')::bigint and c.deleted_at is not null))`,
    );

  return {
    async record(ctx: TenantContext, input: Omit<NewIssueActivityRow, 'org_id'>): Promise<IssueActivityRow> {
      const [row] = await db
        .insert(issue_activity)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    /** The newest change to one field, by anyone: another actor's row is itself a hard stop. */
    async latestFieldChange(ctx: TenantContext, issueId: number, field: string): Promise<IssueActivityRow | undefined> {
      const [row] = await db
        .select()
        .from(issue_activity)
        .where(and(onIssue(ctx, issueId), eq(issue_activity.kind, 'field_changed'), eq(issue_activity.field, field)))
        .orderBy(desc(issue_activity.id))
        .limit(1);
      return row;
    },

    async hasCommentAfter(ctx: TenantContext, issueId: number, activityId: number): Promise<boolean> {
      const [row] = await db
        .select({ id: issue_activity.id })
        .from(issue_activity)
        .where(and(onIssue(ctx, issueId), eq(issue_activity.kind, 'commented'), gt(issue_activity.id, activityId)))
        .limit(1);
      return row !== undefined;
    },

    async rewrite(ctx: TenantContext, id: number, newValue: unknown, at: Date): Promise<IssueActivityRow | undefined> {
      const [row] = await db
        .update(issue_activity)
        .set({ new_value: newValue, updated_at: at })
        .where(and(eq(issue_activity.org_id, ctx.orgId), eq(issue_activity.id, id)))
        .returning();
      return row;
    },

    async erase(ctx: TenantContext, id: number): Promise<void> {
      await db.delete(issue_activity).where(and(eq(issue_activity.org_id, ctx.orgId), eq(issue_activity.id, id)));
    },

    /** Rows first touched after `after`, oldest first: what a notification fan-out reads. */
    async listCreatedAfter(ctx: TenantContext, issueId: number, after: Date): Promise<IssueActivityRow[]> {
      return db
        .select()
        .from(issue_activity)
        .where(and(onIssue(ctx, issueId), gt(issue_activity.created_at, after)))
        .orderBy(asc(issue_activity.id));
    },

    // Oldest first. A coalesced row keeps its id, so id order is first-touch order and the
    // timeline never reshuffles; created_at is microseconds, which a JS Date cursor would truncate.
    async list(
      ctx: TenantContext,
      issueId: number,
      page: IssueActivityPage,
      filter: IssueActivityFilter = {},
    ): Promise<IssueActivityWithActor[]> {
      const after = page.afterId !== undefined ? gt(issue_activity.id, page.afterId) : undefined;
      return db
        .select({ activity: issue_activity, actor: users, actor_membership: org_members })
        .from(issue_activity)
        .innerJoin(users, eq(users.id, issue_activity.actor_id))
        .leftJoin(
          org_members,
          and(eq(org_members.org_id, issue_activity.org_id), eq(org_members.user_id, issue_activity.actor_id)),
        )
        .where(and(visible(ctx, issueId, filter), after))
        .orderBy(asc(issue_activity.id))
        .limit(page.limit);
    },

    async count(ctx: TenantContext, issueId: number, filter: IssueActivityFilter = {}): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(issue_activity)
        .where(visible(ctx, issueId, filter));
      return row?.n ?? 0;
    },
  };
}

export type IssueActivityRepository = ReturnType<typeof issueActivityRepository>;
