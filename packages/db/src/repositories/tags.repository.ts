import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { issue_tags, tags, type TagRow } from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export function tagsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(tags.org_id, ctx.orgId);

  return {
    async findBySlugs(ctx: TenantContext, slugs: string[]): Promise<TagRow[]> {
      if (slugs.length === 0) return [];
      return db
        .select()
        .from(tags)
        .where(and(inOrg(ctx), inArray(tags.slug, [...new Set(slugs)])));
    },

    /** A slug taken by a concurrent request is kept, not overwritten: the first spelling wins. */
    async insertMissing(
      ctx: TenantContext,
      rows: { name: string; slug: string; color: string; created_by: number }[],
    ): Promise<void> {
      if (rows.length === 0) return;
      await db
        .insert(tags)
        .values(rows.map(r => ({ ...r, org_id: ctx.orgId })))
        .onConflictDoNothing({ target: [tags.org_id, tags.slug] });
    },

    async listForIssues(ctx: TenantContext, issueIds: number[]): Promise<{ issue_id: number; tag: TagRow }[]> {
      if (issueIds.length === 0) return [];
      return db
        .select({ issue_id: issue_tags.issue_id, tag: tags })
        .from(issue_tags)
        .innerJoin(tags, and(eq(tags.id, issue_tags.tag_id), eq(tags.org_id, issue_tags.org_id)))
        .where(and(eq(issue_tags.org_id, ctx.orgId), inArray(issue_tags.issue_id, issueIds)))
        .orderBy(sql`lower(${tags.name})`, tags.id);
    },

    /** Returns the tag ids newly applied; one already on the issue is not a change. */
    async apply(ctx: TenantContext, issueId: number, tagIds: number[]): Promise<number[]> {
      if (tagIds.length === 0) return [];
      const rows = await db
        .insert(issue_tags)
        .values(tagIds.map(tag_id => ({ issue_id: issueId, org_id: ctx.orgId, tag_id })))
        .onConflictDoNothing()
        .returning({ tag_id: issue_tags.tag_id });
      return rows.map(r => r.tag_id);
    },

    async remove(ctx: TenantContext, issueId: number, tagId: number): Promise<boolean> {
      const rows = await db
        .delete(issue_tags)
        .where(and(eq(issue_tags.org_id, ctx.orgId), eq(issue_tags.issue_id, issueId), eq(issue_tags.tag_id, tagId)))
        .returning({ tag_id: issue_tags.tag_id });
      return rows.length > 0;
    },
  };
}

export type TagsRepository = ReturnType<typeof tagsRepository>;
