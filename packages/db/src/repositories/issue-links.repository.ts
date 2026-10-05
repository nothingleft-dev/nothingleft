import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { issue_links, issues, type IssueLinkRow, type IssueRow } from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';
import { issueColumns } from './issues.repository.ts';

export interface IssueLinkEnds {
  from_issue_id: number;
  to_issue_id: number;
  type: string;
}

export interface LinkedIssue {
  link: IssueLinkRow;
  other: IssueRow;
}

export function issueLinksRepository(db: Queryable) {
  const exact = (ctx: TenantContext, ends: IssueLinkEnds) =>
    and(
      eq(issue_links.org_id, ctx.orgId),
      eq(issue_links.from_issue_id, ends.from_issue_id),
      eq(issue_links.to_issue_id, ends.to_issue_id),
      eq(issue_links.type, ends.type),
    );

  return {
    /** Undefined when the link already exists. */
    async insert(
      ctx: TenantContext,
      input: IssueLinkEnds & { created_by: number; created_at: Date },
    ): Promise<IssueLinkRow | undefined> {
      const [row] = await db
        .insert(issue_links)
        .values({ ...input, org_id: ctx.orgId })
        .onConflictDoNothing()
        .returning();
      return row;
    },

    async remove(ctx: TenantContext, ends: IssueLinkEnds): Promise<IssueLinkRow | undefined> {
      const [row] = await db.delete(issue_links).where(exact(ctx, ends)).returning();
      return row;
    },

    async exists(ctx: TenantContext, ends: IssueLinkEnds): Promise<boolean> {
      const [row] = await db.select({ id: issue_links.id }).from(issue_links).where(exact(ctx, ends)).limit(1);
      return row !== undefined;
    },

    /** Both directions; a soft-deleted issue on the far end is not shown. */
    async listForIssue(ctx: TenantContext, issueId: number): Promise<LinkedIssue[]> {
      return db
        .select({ link: issue_links, other: issueColumns })
        .from(issue_links)
        .innerJoin(
          issues,
          and(
            eq(issues.org_id, issue_links.org_id),
            sql`${issues.id} = case when ${issue_links.from_issue_id} = ${issueId} then ${issue_links.to_issue_id} else ${issue_links.from_issue_id} end`,
          ),
        )
        .where(
          and(
            eq(issue_links.org_id, ctx.orgId),
            or(eq(issue_links.from_issue_id, issueId), eq(issue_links.to_issue_id, issueId)),
            isNull(issues.deleted_at),
          ),
        )
        .orderBy(issue_links.id);
    },

    /** Whether `to` is already reachable from `from` along links of one type, soft-deleted issues included. */
    async reaches(ctx: TenantContext, type: string, fromId: number, toId: number): Promise<boolean> {
      const result = await db.execute<{ found: boolean }>(sql`
        with recursive reach(id) as (
          select ${fromId}::bigint
          union
          select l.to_issue_id from issue_links l join reach r on l.from_issue_id = r.id
          where l.org_id = ${ctx.orgId} and l.type = ${type}
        )
        select exists (select 1 from reach where id = ${toId}) as found`);
      return result.rows[0]?.found === true;
    },
  };
}

export type IssueLinksRepository = ReturnType<typeof issueLinksRepository>;
