import { and, asc, count, desc, eq, getTableColumns, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  article_issue_refs,
  article_stars,
  article_tags,
  article_watchers,
  articles,
  attachments,
  comments,
  mentions,
  tags,
  type ArticleRow,
  type MentionRow,
  type TagRow,
} from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

const allColumns = getTableColumns(articles);
export const articleColumns = Object.fromEntries(
  Object.entries(allColumns).filter(([name]) => name !== 'search_tsv'),
) as Omit<typeof allColumns, 'search_tsv'>;

export type ArticleTreeRow = Pick<
  ArticleRow,
  'id' | 'parent_id' | 'title' | 'slug' | 'status' | 'position' | 'created_by' | 'updated_at' | 'deleted_at'
>;

const treeColumns = {
  id: articles.id,
  parent_id: articles.parent_id,
  title: articles.title,
  slug: articles.slug,
  status: articles.status,
  position: articles.position,
  created_by: articles.created_by,
  updated_at: articles.updated_at,
  deleted_at: articles.deleted_at,
};

export type NewArticle = Pick<
  ArticleRow,
  'project_id' | 'parent_id' | 'title' | 'slug' | 'body_md' | 'status' | 'position' | 'created_by' | 'published_at'
> & { created_at: Date };

export type ArticlePatch = Partial<
  Pick<
    ArticleRow,
    | 'parent_id'
    | 'title'
    | 'slug'
    | 'body_md'
    | 'status'
    | 'position'
    | 'updated_by'
    | 'updated_at'
    | 'published_at'
    | 'deleted_at'
  >
>;

export interface ArticleSignals {
  starred: boolean;
  watching: boolean;
}

export type MentionSource = { type: 'article' | 'comment'; id: number; articleId: number };

export function articlesRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(articles.org_id, ctx.orgId);
  const liveIn = (ctx: TenantContext, projectId: number) =>
    and(inOrg(ctx), eq(articles.project_id, projectId), isNull(articles.deleted_at));

  const countBy = async (
    ctx: TenantContext,
    ids: number[],
    query: (ids: number[]) => Promise<{ id: number | null; n: number }[]>,
  ): Promise<Map<number, number>> => {
    if (ids.length === 0) return new Map();
    const rows = await query([...new Set(ids)]);
    return new Map(rows.filter(r => r.id !== null).map(r => [r.id!, r.n]));
  };

  return {
    async insert(ctx: TenantContext, row: NewArticle): Promise<ArticleRow> {
      const [created] = await db
        .insert(articles)
        .values({ ...row, org_id: ctx.orgId, updated_by: row.created_by, updated_at: row.created_at })
        .returning(articleColumns);
      if (!created) throw new Error('insert returned no row');
      return created;
    },

    async findById(ctx: TenantContext, id: number): Promise<ArticleRow | undefined> {
      const [row] = await db
        .select(articleColumns)
        .from(articles)
        .where(and(inOrg(ctx), eq(articles.id, id)));
      return row;
    },

    async findByIds(ctx: TenantContext, ids: number[]): Promise<ArticleRow[]> {
      if (ids.length === 0) return [];
      return db
        .select(articleColumns)
        .from(articles)
        .where(and(inOrg(ctx), inArray(articles.id, [...new Set(ids)])));
    },

    async lockById(ctx: TenantContext, id: number): Promise<ArticleRow | undefined> {
      const [row] = await db
        .select(articleColumns)
        .from(articles)
        .where(and(inOrg(ctx), eq(articles.id, id)))
        .for('update');
      return row;
    },

    async findLiveBySlug(ctx: TenantContext, projectId: number, slug: string): Promise<ArticleRow | undefined> {
      const [row] = await db
        .select(articleColumns)
        .from(articles)
        .where(and(liveIn(ctx, projectId), sql`lower(${articles.slug}) = lower(${slug})`));
      return row;
    },

    async findLiveByTitle(ctx: TenantContext, projectId: number, title: string): Promise<ArticleRow[]> {
      return db
        .select(articleColumns)
        .from(articles)
        .where(and(liveIn(ctx, projectId), sql`lower(${articles.title}) = lower(${title})`))
        .orderBy(asc(articles.id));
    },

    /** The most recently deleted article that had this slug. */
    async findDeletedBySlug(ctx: TenantContext, projectId: number, slug: string): Promise<ArticleRow | undefined> {
      const [row] = await db
        .select(articleColumns)
        .from(articles)
        .where(
          and(
            inOrg(ctx),
            eq(articles.project_id, projectId),
            isNotNull(articles.deleted_at),
            sql`lower(${articles.slug}) = lower(${slug})`,
          ),
        )
        .orderBy(desc(articles.deleted_at), desc(articles.id))
        .limit(1);
      return row;
    },

    async update(ctx: TenantContext, id: number, patch: ArticlePatch): Promise<ArticleRow | undefined> {
      const [row] = await db
        .update(articles)
        .set(patch)
        .where(and(inOrg(ctx), eq(articles.id, id)))
        .returning(articleColumns);
      return row;
    },

    /** Live articles, or with `deleted` the soft-deleted ones, in sibling order. */
    async tree(ctx: TenantContext, projectId: number, options: { deleted?: boolean } = {}): Promise<ArticleTreeRow[]> {
      return db
        .select(treeColumns)
        .from(articles)
        .where(
          and(
            inOrg(ctx),
            eq(articles.project_id, projectId),
            options.deleted ? isNotNull(articles.deleted_at) : isNull(articles.deleted_at),
          ),
        )
        .orderBy(asc(articles.position), asc(articles.id));
    },

    async liveSlugs(ctx: TenantContext, projectId: number): Promise<Set<string>> {
      const rows = await db
        .select({ slug: sql<string>`lower(${articles.slug})` })
        .from(articles)
        .where(liveIn(ctx, projectId));
      return new Set(rows.map(r => r.slug));
    },

    /** Serialises every tree write in one project until the transaction ends: positions, parents, slugs. */
    async lockTree(ctx: TenantContext, projectId: number): Promise<void> {
      await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`articles:${ctx.orgId}:${projectId}`}, 0))`);
    },

    async setPositions(ctx: TenantContext, rows: { id: number; position: number }[]): Promise<void> {
      for (const row of rows) {
        await db
          .update(articles)
          .set({ position: row.position })
          .where(and(inOrg(ctx), eq(articles.id, row.id)));
      }
    },

    async softDelete(ctx: TenantContext, ids: number[], at: Date): Promise<void> {
      if (ids.length === 0) return;
      await db
        .update(articles)
        .set({ deleted_at: at })
        .where(and(inOrg(ctx), inArray(articles.id, ids), isNull(articles.deleted_at)));
    },

    /** The articles one delete removed together: they share its deleted_at to the microsecond. */
    async deletedTogether(ctx: TenantContext, projectId: number, deletedAt: Date): Promise<ArticleRow[]> {
      return db
        .select(articleColumns)
        .from(articles)
        .where(and(inOrg(ctx), eq(articles.project_id, projectId), eq(articles.deleted_at, deletedAt)))
        .orderBy(asc(articles.id));
    },

    async commentCounts(ctx: TenantContext, ids: number[]): Promise<Map<number, number>> {
      return countBy(ctx, ids, list =>
        db
          .select({ id: comments.article_id, n: count() })
          .from(comments)
          .where(and(eq(comments.org_id, ctx.orgId), inArray(comments.article_id, list), isNull(comments.deleted_at)))
          .groupBy(comments.article_id),
      );
    },

    async attachmentCounts(ctx: TenantContext, ids: number[]): Promise<Map<number, number>> {
      return countBy(ctx, ids, list =>
        db
          .select({ id: attachments.article_id, n: count() })
          .from(attachments)
          .where(
            and(
              eq(attachments.org_id, ctx.orgId),
              inArray(attachments.article_id, list),
              isNotNull(attachments.completed_at),
              isNull(attachments.deleted_at),
            ),
          )
          .groupBy(attachments.article_id),
      );
    },

    async watcherCounts(ctx: TenantContext, ids: number[]): Promise<Map<number, number>> {
      return countBy(ctx, ids, list =>
        db
          .select({ id: article_watchers.article_id, n: count() })
          .from(article_watchers)
          .where(and(eq(article_watchers.org_id, ctx.orgId), inArray(article_watchers.article_id, list)))
          .groupBy(article_watchers.article_id),
      );
    },

    async tagsFor(ctx: TenantContext, ids: number[]): Promise<{ article_id: number; tag: TagRow }[]> {
      if (ids.length === 0) return [];
      return db
        .select({ article_id: article_tags.article_id, tag: tags })
        .from(article_tags)
        .innerJoin(tags, and(eq(tags.id, article_tags.tag_id), eq(tags.org_id, article_tags.org_id)))
        .where(and(eq(article_tags.org_id, ctx.orgId), inArray(article_tags.article_id, [...new Set(ids)])))
        .orderBy(sql`lower(${tags.name})`, tags.id);
    },

    /** Returns the tag ids newly applied; one already on the article is not a change. */
    async applyTags(ctx: TenantContext, articleId: number, tagIds: number[]): Promise<number[]> {
      if (tagIds.length === 0) return [];
      const rows = await db
        .insert(article_tags)
        .values(tagIds.map(tag_id => ({ article_id: articleId, org_id: ctx.orgId, tag_id })))
        .onConflictDoNothing()
        .returning({ tag_id: article_tags.tag_id });
      return rows.map(r => r.tag_id);
    },

    async removeTag(ctx: TenantContext, articleId: number, tagId: number): Promise<boolean> {
      const rows = await db
        .delete(article_tags)
        .where(
          and(
            eq(article_tags.org_id, ctx.orgId),
            eq(article_tags.article_id, articleId),
            eq(article_tags.tag_id, tagId),
          ),
        )
        .returning({ tag_id: article_tags.tag_id });
      return rows.length > 0;
    },

    async signalsFor(ctx: TenantContext, ids: number[], userId: number): Promise<Map<number, ArticleSignals>> {
      const out = new Map<number, ArticleSignals>();
      if (ids.length === 0) return out;
      for (const id of ids) out.set(id, { starred: false, watching: false });
      const [stars, watches] = await Promise.all([
        db
          .select({ id: article_stars.article_id })
          .from(article_stars)
          .where(
            and(
              eq(article_stars.org_id, ctx.orgId),
              eq(article_stars.user_id, userId),
              inArray(article_stars.article_id, ids),
            ),
          ),
        db
          .select({ id: article_watchers.article_id })
          .from(article_watchers)
          .where(
            and(
              eq(article_watchers.org_id, ctx.orgId),
              eq(article_watchers.user_id, userId),
              inArray(article_watchers.article_id, ids),
            ),
          ),
      ]);
      for (const r of stars) out.get(r.id)!.starred = true;
      for (const r of watches) out.get(r.id)!.watching = true;
      return out;
    },

    async starredIn(ctx: TenantContext, projectId: number, userId: number): Promise<Set<number>> {
      const rows = await db
        .select({ id: article_stars.article_id })
        .from(article_stars)
        .innerJoin(articles, and(eq(articles.id, article_stars.article_id), eq(articles.org_id, article_stars.org_id)))
        .where(
          and(
            eq(article_stars.org_id, ctx.orgId),
            eq(article_stars.user_id, userId),
            eq(articles.project_id, projectId),
          ),
        );
      return new Set(rows.map(r => r.id));
    },

    async star(ctx: TenantContext, articleId: number, userId: number): Promise<void> {
      await db
        .insert(article_stars)
        .values({ article_id: articleId, org_id: ctx.orgId, user_id: userId })
        .onConflictDoNothing();
    },

    async unstar(ctx: TenantContext, articleId: number, userId: number): Promise<void> {
      await db
        .delete(article_stars)
        .where(
          and(
            eq(article_stars.org_id, ctx.orgId),
            eq(article_stars.article_id, articleId),
            eq(article_stars.user_id, userId),
          ),
        );
    },

    /** An explicit watch upgrades an automatic one; an automatic one never downgrades an explicit one. */
    async watch(ctx: TenantContext, articleId: number, userIds: number[], source: 'explicit' | 'auto'): Promise<void> {
      if (userIds.length === 0) return;
      const insert = db
        .insert(article_watchers)
        .values([...new Set(userIds)].map(user_id => ({ article_id: articleId, org_id: ctx.orgId, user_id, source })));
      if (source === 'explicit') {
        await insert.onConflictDoUpdate({
          target: [article_watchers.article_id, article_watchers.user_id],
          set: { source: 'explicit' },
        });
      } else {
        await insert.onConflictDoNothing();
      }
    },

    async unwatch(ctx: TenantContext, articleId: number, userId: number): Promise<void> {
      await db
        .delete(article_watchers)
        .where(
          and(
            eq(article_watchers.org_id, ctx.orgId),
            eq(article_watchers.article_id, articleId),
            eq(article_watchers.user_id, userId),
          ),
        );
    },

    async replaceMentions(ctx: TenantContext, source: MentionSource, userIds: number[]): Promise<void> {
      await db
        .delete(mentions)
        .where(
          and(eq(mentions.org_id, ctx.orgId), eq(mentions.source_type, source.type), eq(mentions.source_id, source.id)),
        );
      if (userIds.length === 0) return;
      await db.insert(mentions).values(
        [...new Set(userIds)].map(mentioned_user_id => ({
          org_id: ctx.orgId,
          source_type: source.type,
          source_id: source.id,
          mentioned_user_id,
          article_id: source.articleId,
        })),
      );
    },

    /** The mention rows one source wrote, for fan-out and for checking what hangs off what. */
    async mentionsOf(ctx: TenantContext, source: Omit<MentionSource, 'articleId'>): Promise<MentionRow[]> {
      return db
        .select()
        .from(mentions)
        .where(
          and(eq(mentions.org_id, ctx.orgId), eq(mentions.source_type, source.type), eq(mentions.source_id, source.id)),
        );
    },

    async replaceIssueRefs(ctx: TenantContext, articleId: number, issueKeys: string[]): Promise<void> {
      await db
        .delete(article_issue_refs)
        .where(and(eq(article_issue_refs.org_id, ctx.orgId), eq(article_issue_refs.article_id, articleId)));
      if (issueKeys.length === 0) return;
      await db
        .insert(article_issue_refs)
        .values([...new Set(issueKeys)].map(issue_key => ({ article_id: articleId, org_id: ctx.orgId, issue_key })));
    },

    /** Live articles whose body mentions the key, in any project of the organisation. */
    async referencing(ctx: TenantContext, issueKey: string): Promise<ArticleRow[]> {
      return db
        .select(articleColumns)
        .from(article_issue_refs)
        .innerJoin(
          articles,
          and(eq(articles.id, article_issue_refs.article_id), eq(articles.org_id, article_issue_refs.org_id)),
        )
        .where(
          and(
            eq(article_issue_refs.org_id, ctx.orgId),
            eq(article_issue_refs.issue_key, issueKey),
            isNull(articles.deleted_at),
          ),
        )
        .orderBy(asc(articles.title), asc(articles.id));
    },

    /** The nightly purge's one cross-tenant read: which organisations have deleted articles to purge. */
    async orgsWithDeletedBefore(_ctx: SystemContext, cutoff: Date): Promise<number[]> {
      const rows = await db
        .selectDistinct({ org_id: articles.org_id })
        .from(articles)
        .where(lt(articles.deleted_at, cutoff));
      return rows.map(r => r.org_id);
    },

    /** Hard delete; comments, mentions, tags, stars, watchers, references and attachment rows go by cascade. */
    async purgeDeletedBefore(ctx: TenantContext, cutoff: Date): Promise<number> {
      const doomed = db
        .select({ id: articles.id })
        .from(articles)
        .where(and(inOrg(ctx), lt(articles.deleted_at, cutoff)));
      // Another deleted article may still name a doomed one as its parent; it loses the parent instead.
      await db
        .update(articles)
        .set({ parent_id: null })
        .where(and(inOrg(ctx), inArray(articles.parent_id, doomed)));
      const rows = await db
        .delete(articles)
        .where(and(inOrg(ctx), lt(articles.deleted_at, cutoff)))
        .returning({ id: articles.id });
      return rows.length;
    },
  };
}

export type ArticlesRepository = ReturnType<typeof articlesRepository>;
