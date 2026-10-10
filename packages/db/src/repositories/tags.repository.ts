import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { issue_tags, tags, type TagRow } from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, c => `\\${c}`);

export interface TagWithUsage {
  tag: TagRow;
  issue_count: number;
  article_count: number;
}

export function tagsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(tags.org_id, ctx.orgId);
  // Literal tags.id: a single-table select renders ${tags.id} as bare "id", which binds inside the subquery.
  const issueCount = (ctx: TenantContext) =>
    sql<number>`(select count(*)::int from issue_tags it join issues i on i.id = it.issue_id and i.org_id = it.org_id where it.tag_id = tags.id and it.org_id = ${ctx.orgId} and i.deleted_at is null)`;
  const articleCount = (ctx: TenantContext) =>
    sql<number>`(select count(*)::int from article_tags at join articles a on a.id = at.article_id and a.org_id = at.org_id where at.tag_id = tags.id and at.org_id = ${ctx.orgId} and a.deleted_at is null)`;

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

    /** Every tag of the organisation with its live issues and articles, whoever can read them. */
    async listWithUsage(
      ctx: TenantContext,
      options: { q?: string | undefined; ids?: number[]; limit: number; offset: number },
    ): Promise<{ rows: TagWithUsage[]; total: number }> {
      const pattern = options.q ? `%${escapeLike(options.q)}%` : undefined;
      const where = and(
        inOrg(ctx),
        pattern ? sql`(${tags.name} ilike ${pattern} or ${tags.slug} ilike ${pattern})` : undefined,
        options.ids ? inArray(tags.id, options.ids.length ? options.ids : [0]) : undefined,
      );
      const [rows, [totals]] = await Promise.all([
        db
          .select({ tag: tags, issue_count: issueCount(ctx), article_count: articleCount(ctx) })
          .from(tags)
          .where(where)
          .orderBy(asc(tags.slug))
          .limit(options.limit)
          .offset(options.offset),
        db.select({ n: count() }).from(tags).where(where),
      ]);
      return { rows, total: totals?.n ?? 0 };
    },

    async update(
      ctx: TenantContext,
      id: number,
      patch: Partial<Pick<TagRow, 'name' | 'slug' | 'color'>>,
    ): Promise<TagRow | undefined> {
      const [row] = await db
        .update(tags)
        .set(patch)
        .where(and(inOrg(ctx), eq(tags.id, id)))
        .returning();
      return row;
    },

    /** Everything tagged with a source gains the target, then the sources go with their junction rows. */
    async mergeInto(
      ctx: TenantContext,
      sourceIds: number[],
      targetId: number,
    ): Promise<{ issues: number; articles: number }> {
      if (sourceIds.length === 0) return { issues: 0, articles: 0 };
      const issueRows = await db.execute<{ n: number }>(sql`
        with moved as (
          insert into issue_tags (issue_id, org_id, tag_id)
          select distinct issue_id, org_id, ${targetId}::bigint from issue_tags
          where org_id = ${ctx.orgId} and tag_id in (${sql.join(
            sourceIds.map(id => sql`${id}`),
            sql`, `,
          )})
          on conflict do nothing
          returning 1
        ) select count(*)::int as n from moved`);
      const articleRows = await db.execute<{ n: number }>(sql`
        with moved as (
          insert into article_tags (article_id, org_id, tag_id)
          select distinct article_id, org_id, ${targetId}::bigint from article_tags
          where org_id = ${ctx.orgId} and tag_id in (${sql.join(
            sourceIds.map(id => sql`${id}`),
            sql`, `,
          )})
          on conflict do nothing
          returning 1
        ) select count(*)::int as n from moved`);
      await db.delete(tags).where(and(inOrg(ctx), inArray(tags.id, sourceIds)));
      return { issues: issueRows.rows[0]?.n ?? 0, articles: articleRows.rows[0]?.n ?? 0 };
    },

    async deleteTag(ctx: TenantContext, id: number): Promise<TagRow | undefined> {
      const [row] = await db
        .delete(tags)
        .where(and(inOrg(ctx), eq(tags.id, id)))
        .returning();
      return row;
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
