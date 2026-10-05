import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import type { Query, SortKey } from '@nothingleft/query';
import type { Queryable } from '../client.ts';
import { org_members, projects, tags, type ArticleRow, type TagRow } from '../schema/index.ts';
import { articles } from '../schema/articles.ts';
import { articleSearch, articleVisible, type ArticleSearchScope } from '../search/article-query.ts';
import type { TenantContext } from '../tenant-context.ts';
import { articleColumns } from './articles.repository.ts';

export interface ArticleSearchRow {
  article: ArticleRow;
  project: { key: string; name: string };
}

export interface ArticleVocabulary {
  tags: { name: string; slug: string }[];
  parents: { title: string; slug: string }[];
  usernames: { username: string; removed_at: Date | null }[];
}

/** Who reads, for the tag counts: issues in `issueProjectIds`, articles through `articleVisible`. */
export interface TagUsageScope {
  userId: number;
  issueProjectIds: readonly number[];
  articleProjectIds: readonly number[];
  ownDraftProjectIds: readonly number[];
  adminProjectIds: readonly number[];
}

export interface TagUsageOptions {
  q?: string | undefined;
  context?: 'issue' | 'article' | undefined;
  inUse?: boolean | undefined;
  limit: number;
  offset: number;
}

export interface TagUsageRow {
  tag: TagRow;
  issue_count: number;
  article_count: number;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, c => `\\${c}`);
const idList = (ids: readonly number[]) =>
  sql.join(
    ids.map(id => sql`${id}`),
    sql`, `,
  );

export function articleSearchRepository(db: Queryable) {
  /** Titles for the `parent:` autocomplete, among the articles the caller may open. */
  async function parentSuggestions(
    ctx: TenantContext,
    scope: ArticleSearchScope,
    prefix: string,
    limit: number,
  ): Promise<string[]> {
    const rows = await db
      .selectDistinct({ title: articles.title })
      .from(articles)
      .where(
        and(articleVisible({ ...scope, orgId: ctx.orgId }), sql`${articles.title} ilike ${`${escapeLike(prefix)}%`}`),
      )
      .orderBy(asc(articles.title))
      .limit(limit);
    return rows.map(r => r.title);
  }

  return {
    parentSuggestions,

    async search(
      ctx: TenantContext,
      scope: ArticleSearchScope,
      query: Query,
      options: { sort: readonly SortKey[]; limit: number; offset: number },
    ): Promise<{ rows: ArticleSearchRow[]; total: number }> {
      const compiled = articleSearch({ ...scope, orgId: ctx.orgId });
      const where = compiled.where(query);
      const [rows, [totals]] = await Promise.all([
        db
          .select({ article: articleColumns, project: { key: projects.key, name: projects.name } })
          .from(articles)
          .innerJoin(projects, and(eq(projects.id, articles.project_id), eq(projects.org_id, articles.org_id)))
          .where(where)
          .orderBy(...compiled.orderBy(query, options.sort))
          .limit(options.limit)
          .offset(options.offset),
        db.select({ n: count() }).from(articles).where(where),
      ]);
      return { rows, total: totals?.n ?? 0 };
    },

    /** The names an article query may use, for `valid_values` on a miss. */
    async vocabulary(
      ctx: TenantContext,
      scope: ArticleSearchScope,
      needs: ReadonlySet<string>,
    ): Promise<ArticleVocabulary> {
      const visible = articleVisible({ ...scope, orgId: ctx.orgId });
      const [tagRows, parents, usernames] = await Promise.all([
        needs.has('tag') || needs.has('#')
          ? db
              .select({ name: tags.name, slug: tags.slug })
              .from(tags)
              .where(eq(tags.org_id, ctx.orgId))
              .orderBy(tags.slug)
          : [],
        needs.has('parent')
          ? db
              .selectDistinct({ title: articles.title, slug: articles.slug })
              .from(articles)
              .where(visible)
              .orderBy(articles.title)
          : [],
        needs.has('user')
          ? db
              .select({ username: org_members.username, removed_at: org_members.removed_at })
              .from(org_members)
              .where(eq(org_members.org_id, ctx.orgId))
              .orderBy(sql`lower(${org_members.username})`)
          : [],
      ]);
      return { tags: tagRows, parents, usernames };
    },

    /** Autocomplete values for one attribute of the article vocabulary: tag, parent or people. */
    async suggestValues(
      ctx: TenantContext,
      scope: ArticleSearchScope,
      attribute: string,
      prefix: string,
      limit: number,
    ): Promise<string[]> {
      const pattern = `${escapeLike(prefix)}%`;
      if (attribute === 'parent') return parentSuggestions(ctx, scope, prefix, limit);
      if (attribute === 'tag') {
        const rows = await db
          .select({ name: tags.name })
          .from(tags)
          .where(and(eq(tags.org_id, ctx.orgId), sql`(${tags.name} ilike ${pattern} or ${tags.slug} ilike ${pattern})`))
          .orderBy(tags.slug)
          .limit(limit);
        return rows.map(r => r.name);
      }
      if (attribute === 'user') {
        const rows = await db
          .select({ username: org_members.username })
          .from(org_members)
          .where(
            and(
              eq(org_members.org_id, ctx.orgId),
              isNull(org_members.removed_at),
              sql`${org_members.username} ilike ${pattern}`,
            ),
          )
          .orderBy(sql`lower(${org_members.username})`)
          .limit(limit);
        return rows.map(r => r.username);
      }
      return [];
    },

    /**
     * The organisation's tags with how often the caller can see each used. `context` ranks that
     * kind of use first and, with `inUse`, keeps only tags with such a use; it never hides a tag otherwise.
     */
    async tagUsage(
      ctx: TenantContext,
      scope: TagUsageScope,
      options: TagUsageOptions,
    ): Promise<{ rows: TagUsageRow[]; total: number }> {
      // Literal tags.id: a single-table select renders ${tags.id} as bare "id", which binds inside the subquery.
      const issueCount =
        scope.issueProjectIds.length === 0
          ? sql<number>`0`
          : sql<number>`(select count(*)::int from issue_tags it join issues i on i.id = it.issue_id and i.org_id = it.org_id where it.tag_id = tags.id and it.org_id = ${ctx.orgId} and i.deleted_at is null and i.project_id in (${idList(scope.issueProjectIds)}))`;
      const visible = articleVisible({
        orgId: ctx.orgId,
        userId: scope.userId,
        projectIds: scope.articleProjectIds,
        ownDraftProjectIds: scope.ownDraftProjectIds,
        adminProjectIds: scope.adminProjectIds,
      });
      const articleCount = sql<number>`(select count(*)::int from article_tags at join articles on articles.id = at.article_id and articles.org_id = at.org_id where at.tag_id = tags.id and at.org_id = ${ctx.orgId} and ${visible})`;
      const pattern = options.q ? `%${escapeLike(options.q)}%` : undefined;
      const used =
        options.context === 'issue'
          ? sql`${issueCount} > 0`
          : options.context === 'article'
            ? sql`${articleCount} > 0`
            : sql`(${issueCount} + ${articleCount}) > 0`;
      const where = and(
        eq(tags.org_id, ctx.orgId),
        pattern ? sql`(${tags.name} ilike ${pattern} or ${tags.slug} ilike ${pattern})` : undefined,
        options.inUse ? used : undefined,
      );
      const rank = options.context === 'issue' ? issueCount : options.context === 'article' ? articleCount : undefined;
      const [rows, [totals]] = await Promise.all([
        db
          .select({ tag: tags, issue_count: issueCount, article_count: articleCount })
          .from(tags)
          .where(where)
          .orderBy(...(rank ? [sql`${rank} desc`] : []), asc(tags.slug))
          .limit(options.limit)
          .offset(options.offset),
        db.select({ n: count() }).from(tags).where(where),
      ]);
      return { rows, total: totals?.n ?? 0 };
    },
  };
}

export type ArticleSearchRepository = ReturnType<typeof articleSearchRepository>;
