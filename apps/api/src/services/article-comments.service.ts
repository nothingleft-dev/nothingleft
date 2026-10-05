import { recordArticleTouched } from '@services/notify-outbox';
import type {
  ArticleComment,
  CreateComment,
  Pagination,
  Principal,
  ToggleTask,
  UpdateComment,
} from '@nothingleft/types';
import type { CommentRow, CommentsRepository, CommentWithAuthor } from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { checkMarkdownSize, extractReferences, toggleTaskItem } from '@nothingleft/markdown';
import { AppError } from '@lib/errors';
import type { AccessService } from '@services/access';
import type { ArticlesService, LocatedArticle } from '@services/articles.service';
import { claimArticleDrafts, releaseStorage } from '@services/attachment-writer';
import { commentFields } from '@services/comment-dto';
import type { CommentPageQuery } from '@services/comments.service';
import { decodeCursor, encodeCursor } from '@services/issues.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface ArticleCommentsDeps {
  access: AccessService;
  articles: ArticlesService;
  comments: CommentsRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  now?: () => Date;
}

/** Comments on knowledge base articles: the comments table and its rules, hung off an article. */
export function articleCommentsService(deps: ArticleCommentsDeps) {
  const { access, articles, comments, inTransaction, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  const notFound = (located: LocatedArticle, id: number) =>
    new AppError('comment.not_found', 404, { id, key: located.article.slug }, 'id');

  function checkBody(body: string): string {
    if (body.trim() === '') throw new AppError('comment.body_empty', 400, {}, 'body_md');
    const size = checkMarkdownSize(body);
    if (size.level === 'too_large') {
      throw new AppError('comment.body_too_large', 400, { size: Math.ceil(size.bytes / 1024) }, 'body_md');
    }
    return body;
  }

  const dto = (principal: Principal, located: LocatedArticle, row: CommentWithAuthor): ArticleComment => ({
    ...commentFields(access, principal, located.project, row),
    article: { project: located.project.project.key, slug: located.article.slug },
  });

  async function writeMentions(repos: TenantRepos, located: LocatedArticle, comment: CommentRow, body: string | null) {
    const usernames = body ? extractReferences(body).mentions : [];
    const found = await repos.organizations.findMembersByUsernames(located.project.ctx, usernames);
    await repos.articles.replaceMentions(
      located.project.ctx,
      { type: 'comment', id: comment.id, articleId: located.article.id },
      found.map(f => f.user.id),
    );
    return found.length;
  }

  async function findComment(located: LocatedArticle, id: number): Promise<CommentWithAuthor> {
    const row = await comments.findOnArticle(located.project.ctx, located.article.id, id);
    if (!row) throw notFound(located, id);
    return row;
  }

  function requireWritable(located: LocatedArticle) {
    if (located.project.project.is_archived) {
      throw new AppError('project.archived', 409, { key: located.project.project.key });
    }
  }

  function requireOwnOrAbove(
    principal: Principal,
    located: LocatedArticle,
    row: CommentWithAuthor,
    capability: 'comment.update' | 'comment.delete',
  ) {
    access.require(principal, capability, {
      ...located.project.scope,
      isOwnRecord: row.comment.author_id === principal.userId,
    });
    requireWritable(located);
  }

  async function lockedOnLiveArticle(repos: TenantRepos, located: LocatedArticle) {
    const article = await repos.articles.lockById(located.project.ctx, located.article.id);
    if (!article || article.deleted_at) {
      throw new AppError(
        'article.not_found',
        404,
        { project: located.project.project.key, slug: located.article.slug },
        'slug',
      );
    }
  }

  async function edit(
    principal: Principal,
    located: LocatedArticle,
    id: number,
    nextBody: (current: CommentRow) => string,
  ): Promise<ArticleComment> {
    const row = await findComment(located, id);
    requireOwnOrAbove(principal, located, row, 'comment.update');
    await inTransaction(async repos => {
      await lockedOnLiveArticle(repos, located);
      const current = await repos.comments.lockOnArticle(located.project.ctx, located.article.id, id);
      if (!current) throw notFound(located, id);
      const body = nextBody(current);
      if (body === current.body_md) return;
      const at = now();
      await repos.comments.update(located.project.ctx, id, { body_md: body, edited_at: at });
      await writeMentions(repos, located, current, body);
      recordArticleTouched(located.project.ctx.orgId, located.article.id, principal.userId, at);
    });
    return dto(principal, located, await findComment(located, id));
  }

  return {
    async list(
      principal: Principal,
      key: string,
      slug: string,
      query: CommentPageQuery,
      hints: OrgHints = {},
    ): Promise<{ data: ArticleComment[]; pagination: Pagination }> {
      const located = await articles.locate(principal, key, slug, hints);
      const afterId = query.cursor ? decodeCursor(query.cursor) : undefined;
      const [rows, total] = await Promise.all([
        comments.listOnArticle(located.project.ctx, located.article.id, { afterId, limit: query.limit + 1 }),
        comments.countOnArticle(located.project.ctx, located.article.id),
      ]);
      const page = rows.slice(0, query.limit);
      const has_more = rows.length > query.limit;
      return {
        data: page.map(r => dto(principal, located, r)),
        pagination: {
          total,
          limit: query.limit,
          offset: 0,
          next_cursor: has_more ? encodeCursor(page.at(-1)!.comment.id) : null,
          has_more,
        },
      };
    },

    async get(principal: Principal, key: string, slug: string, id: number, hints: OrgHints = {}) {
      const located = await articles.locate(principal, key, slug, hints);
      return dto(principal, located, await findComment(located, id));
    },

    async create(
      principal: Principal,
      key: string,
      slug: string,
      input: CreateComment,
      hints: OrgHints = {},
    ): Promise<ArticleComment> {
      const located = await articles.locate(principal, key, slug, hints);
      access.require(principal, 'article.comment', located.project.scope);
      requireWritable(located);
      if (input.attachment_ids?.length) access.require(principal, 'attachment.upload', located.project.scope);
      const body = checkBody(input.body_md);
      const ctx = located.project.ctx;
      const { comment, mentioned } = await inTransaction(async repos => {
        await lockedOnLiveArticle(repos, located);
        const created = await repos.comments.insert(ctx, {
          article_id: located.article.id,
          author_id: principal.userId,
          body_md: body,
          created_at: now(),
        });
        await repos.articles.watch(ctx, located.article.id, [principal.userId], 'auto');
        const mentionCount = await writeMentions(repos, located, created, body);
        await claimArticleDrafts(
          repos,
          {
            ctx,
            articleId: located.article.id,
            actorId: principal.userId,
            slug: located.article.slug,
            commentId: created.id,
          },
          input.attachment_ids,
        );
        return { comment: created, mentioned: mentionCount };
      });
      recordArticleTouched(ctx.orgId, located.article.id, principal.userId, comment.created_at);
      analytics.capture(
        'comment_created',
        { via: principal.via, mention_count: mentioned },
        { userId: principal.userId, orgId: located.project.organization.id },
      );
      return dto(principal, located, await findComment(located, comment.id));
    },

    async update(
      principal: Principal,
      key: string,
      slug: string,
      id: number,
      input: UpdateComment,
      hints: OrgHints = {},
    ) {
      const located = await articles.locate(principal, key, slug, hints);
      const body = checkBody(input.body_md);
      return edit(principal, located, id, () => body);
    },

    async toggleTask(
      principal: Principal,
      key: string,
      slug: string,
      id: number,
      task: ToggleTask,
      hints: OrgHints = {},
    ) {
      const located = await articles.locate(principal, key, slug, hints);
      return edit(principal, located, id, current => {
        const next = toggleTaskItem(current.body_md, task.index, task.checked);
        if (
          next === current.body_md &&
          toggleTaskItem(current.body_md, task.index, !task.checked) === current.body_md
        ) {
          throw new AppError('issue.no_task', 400, { index: task.index }, 'index');
        }
        return next;
      });
    },

    async remove(principal: Principal, key: string, slug: string, id: number, hints: OrgHints = {}) {
      const located = await articles.locate(principal, key, slug, hints);
      const row = await findComment(located, id);
      requireOwnOrAbove(principal, located, row, 'comment.delete');
      const ctx = located.project.ctx;
      const deleted = await inTransaction(async repos => {
        await lockedOnLiveArticle(repos, located);
        const current = await repos.comments.lockOnArticle(ctx, located.article.id, id);
        if (!current) throw notFound(located, id);
        const at = now();
        const updated = await repos.comments.update(ctx, id, { deleted_at: at });
        await writeMentions(repos, located, current, null);
        const files = await repos.attachments.softDeleteForComment(ctx, id, at);
        await releaseStorage(repos, ctx, files, access.storageLimit);
        return updated!;
      });
      return dto(principal, located, { ...row, comment: deleted });
    },
  };
}

export type ArticleCommentsService = ReturnType<typeof articleCommentsService>;
