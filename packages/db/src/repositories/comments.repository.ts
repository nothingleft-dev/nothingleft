import { and, asc, count, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { comments, org_members, users, type CommentRow, type OrgMemberRow, type UserRow } from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export interface CommentWithAuthor {
  comment: CommentRow;
  author: UserRow;
  author_membership: OrgMemberRow | null;
}

/** The one thing a comment hangs off: an issue or a knowledge base article. */
export type CommentParent = { issueId: number } | { articleId: number };

export interface CommentPage {
  afterId?: number | undefined;
  limit: number;
}

// A soft-deleted comment is gone for every reader; only the purge ever sees it again.
export function commentsRepository(db: Queryable) {
  const liveUnder = (ctx: TenantContext, parent: CommentParent) =>
    and(
      eq(comments.org_id, ctx.orgId),
      'issueId' in parent ? eq(comments.issue_id, parent.issueId) : eq(comments.article_id, parent.articleId),
      isNull(comments.deleted_at),
    );

  const lockUnder = async (ctx: TenantContext, parent: CommentParent, id: number) => {
    const [row] = await db
      .select()
      .from(comments)
      .where(and(liveUnder(ctx, parent), eq(comments.id, id)))
      .for('update');
    return row;
  };
  const findUnder = async (ctx: TenantContext, parent: CommentParent, id: number) => {
    const [row] = await withAuthor()
      .where(and(liveUnder(ctx, parent), eq(comments.id, id)))
      .limit(1);
    return row;
  };
  const listUnder = (ctx: TenantContext, parent: CommentParent, page: CommentPage) => {
    const after = page.afterId !== undefined ? gt(comments.id, page.afterId) : undefined;
    return withAuthor()
      .where(and(liveUnder(ctx, parent), after))
      .orderBy(asc(comments.id))
      .limit(page.limit);
  };
  const countUnder = async (ctx: TenantContext, parent: CommentParent) => {
    const [row] = await db.select({ n: count() }).from(comments).where(liveUnder(ctx, parent));
    return row?.n ?? 0;
  };

  const withAuthor = () =>
    db
      .select({ comment: comments, author: users, author_membership: org_members })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.author_id))
      .leftJoin(org_members, and(eq(org_members.org_id, comments.org_id), eq(org_members.user_id, comments.author_id)));

  return {
    async insert(
      ctx: TenantContext,
      input: ({ issue_id: number } | { article_id: number }) & { author_id: number; body_md: string; created_at: Date },
    ): Promise<CommentRow> {
      const [row] = await db
        .insert(comments)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    /** Row-locked, so an edit and a checkbox toggle on one comment never lose each other's change. */
    async lockOnIssue(ctx: TenantContext, issueId: number, id: number): Promise<CommentRow | undefined> {
      return lockUnder(ctx, { issueId }, id);
    },

    async lockOnArticle(ctx: TenantContext, articleId: number, id: number): Promise<CommentRow | undefined> {
      return lockUnder(ctx, { articleId }, id);
    },

    async findOnIssue(ctx: TenantContext, issueId: number, id: number): Promise<CommentWithAuthor | undefined> {
      return findUnder(ctx, { issueId }, id);
    },

    async findOnArticle(ctx: TenantContext, articleId: number, id: number): Promise<CommentWithAuthor | undefined> {
      return findUnder(ctx, { articleId }, id);
    },

    async update(
      ctx: TenantContext,
      id: number,
      patch: Partial<Pick<CommentRow, 'body_md' | 'edited_at' | 'deleted_at'>>,
    ): Promise<CommentRow | undefined> {
      const [row] = await db
        .update(comments)
        .set(patch)
        .where(and(eq(comments.org_id, ctx.orgId), eq(comments.id, id)))
        .returning();
      return row;
    },

    // Oldest first, by id: the thread reads in the order it was written and a cursor never skips.
    async list(ctx: TenantContext, issueId: number, page: CommentPage): Promise<CommentWithAuthor[]> {
      return listUnder(ctx, { issueId }, page);
    },

    async listOnArticle(ctx: TenantContext, articleId: number, page: CommentPage): Promise<CommentWithAuthor[]> {
      return listUnder(ctx, { articleId }, page);
    },

    async count(ctx: TenantContext, issueId: number): Promise<number> {
      return countUnder(ctx, { issueId });
    },

    async countOnArticle(ctx: TenantContext, articleId: number): Promise<number> {
      return countUnder(ctx, { articleId });
    },

    async countByAuthor(ctx: TenantContext, userId: number): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(comments)
        .where(and(eq(comments.org_id, ctx.orgId), eq(comments.author_id, userId), isNull(comments.deleted_at)));
      return row?.n ?? 0;
    },

    async findLive(ctx: TenantContext, ids: number[]): Promise<CommentWithAuthor[]> {
      if (ids.length === 0) return [];
      return withAuthor().where(
        and(eq(comments.org_id, ctx.orgId), inArray(comments.id, [...new Set(ids)]), isNull(comments.deleted_at)),
      );
    },
  };
}

export type CommentsRepository = ReturnType<typeof commentsRepository>;
