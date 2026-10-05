import type { Comment, CreateComment, Pagination, Principal, ToggleTask, UpdateComment } from '@nothingleft/types';
import type { CommentRow, CommentsRepository, CommentWithAuthor, IssueRow } from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { checkMarkdownSize, extractReferences, toggleTaskItem } from '@nothingleft/markdown';
import { AppError } from '@lib/errors';
import type { AccessService } from '@services/access';
import { commentDto } from '@services/comment-dto';
import { claimDrafts, releaseStorage } from '@services/attachment-writer';
import { recordIssueEvent } from '@services/issue-history';
import { decodeCursor, encodeCursor, type IssuesService, type Located } from '@services/issues.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface CommentsDeps {
  access: AccessService;
  issues: IssuesService;
  comments: CommentsRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  now?: () => Date;
}

export interface CommentPageQuery {
  cursor?: string | undefined;
  limit: number;
}

export function commentsService(deps: CommentsDeps) {
  const { access, issues, comments, inTransaction, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  const keyOf = ({ project, issue }: Located) => issues.keyIn(project)(issue);
  const notFound = (located: Located, id: number) =>
    new AppError('comment.not_found', 404, { id, key: keyOf(located) }, 'id');

  function checkBody(body: string): string {
    if (body.trim() === '') throw new AppError('comment.body_empty', 400, {}, 'body_md');
    const size = checkMarkdownSize(body);
    if (size.level === 'too_large') {
      throw new AppError('comment.body_too_large', 400, { size: Math.ceil(size.bytes / 1024) }, 'body_md');
    }
    return body;
  }

  async function writeMentions(repos: TenantRepos, located: Located, comment: CommentRow, body: string | null) {
    const usernames = body ? extractReferences(body).mentions : [];
    const found = await repos.organizations.findMembersByUsernames(located.project.ctx, usernames);
    await repos.issues.replaceMentions(
      located.project.ctx,
      { type: 'comment', id: comment.id, issueId: located.issue.id },
      found.map(f => f.user.id),
    );
    return found.length;
  }

  const event = (repos: TenantRepos, located: Located, actorId: number, at: Date) => ({
    activity: repos.issueActivity,
    change: { ctx: located.project.ctx, issueId: located.issue.id, actorId, changeGroupId: Bun.randomUUIDv7(), at },
  });

  const dto = (principal: Principal, located: Located, row: CommentWithAuthor) =>
    commentDto(access, principal, located.project, keyOf(located), row);

  async function findComment(located: Located, id: number): Promise<CommentWithAuthor> {
    const row = await comments.findOnIssue(located.project.ctx, located.issue.id, id);
    if (!row) throw notFound(located, id);
    return row;
  }

  function requireOwnOrAbove(
    principal: Principal,
    located: Located,
    row: CommentWithAuthor,
    capability: 'comment.update' | 'comment.delete',
  ) {
    const scope = { ...located.project.scope, isOwnRecord: row.comment.author_id === principal.userId };
    access.require(principal, capability, scope);
    if (located.project.project.is_archived) {
      throw new AppError('project.archived', 409, { key: located.project.project.key });
    }
  }

  async function lockedOnLiveIssue(repos: TenantRepos, located: Located): Promise<IssueRow> {
    const issue = await repos.issues.lockById(located.project.ctx, located.issue.id);
    if (!issue || issue.deleted_at) throw new AppError('issue.not_found', 404, { key: keyOf(located) }, 'key');
    return issue;
  }

  async function edit(
    principal: Principal,
    located: Located,
    id: number,
    nextBody: (current: CommentRow) => string,
  ): Promise<Comment> {
    const row = await findComment(located, id);
    requireOwnOrAbove(principal, located, row, 'comment.update');
    await inTransaction(async repos => {
      await lockedOnLiveIssue(repos, located);
      const current = await repos.comments.lockOnIssue(located.project.ctx, located.issue.id, id);
      if (!current) throw notFound(located, id);
      const body = nextBody(current);
      if (body === current.body_md) return;
      const at = now();
      await repos.comments.update(located.project.ctx, id, { body_md: body, edited_at: at });
      await writeMentions(repos, located, current, body);
      const { activity, change } = event(repos, located, principal.userId, at);
      await recordIssueEvent(activity, change, 'comment_edited', { new_value: { comment_id: id } });
    });
    return dto(principal, located, await findComment(located, id));
  }

  return {
    async list(
      principal: Principal,
      key: string,
      query: CommentPageQuery,
      hints: OrgHints = {},
    ): Promise<{ data: Comment[]; pagination: Pagination }> {
      const located = await issues.locate(principal, key, hints);
      access.require(principal, 'comment.read', located.project.scope);
      const afterId = query.cursor ? decodeCursor(query.cursor) : undefined;
      const [rows, total] = await Promise.all([
        comments.list(located.project.ctx, located.issue.id, { afterId, limit: query.limit + 1 }),
        comments.count(located.project.ctx, located.issue.id),
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

    async get(principal: Principal, key: string, id: number, hints: OrgHints = {}): Promise<Comment> {
      const located = await issues.locate(principal, key, hints);
      access.require(principal, 'comment.read', located.project.scope);
      return dto(principal, located, await findComment(located, id));
    },

    async create(principal: Principal, key: string, input: CreateComment, hints: OrgHints = {}): Promise<Comment> {
      const located = await issues.locate(principal, key, hints);
      issues.requireWritable(principal, located.project, 'comment.create');
      if (input.attachment_ids?.length) access.require(principal, 'attachment.upload', located.project.scope);
      const body = checkBody(input.body_md);
      const { comment, mentioned } = await inTransaction(async repos => {
        const ctx = located.project.ctx;
        await lockedOnLiveIssue(repos, located);
        const at = now();
        const created = await repos.comments.insert(ctx, {
          issue_id: located.issue.id,
          author_id: principal.userId,
          body_md: body,
          created_at: at,
        });
        await repos.issues.adjustCommentCount(ctx, located.issue.id, 1);
        // Owner decision: a comment moves the issue's updated time, not its "Updated by".
        await repos.issues.update(ctx, located.issue.id, { updated_at: at });
        await repos.issues.watch(ctx, located.issue.id, [principal.userId], 'auto');
        const mentionCount = await writeMentions(repos, located, created, body);
        const { activity, change } = event(repos, located, principal.userId, at);
        await recordIssueEvent(activity, change, 'commented', { new_value: { comment_id: created.id } });
        await claimDrafts(
          repos,
          { change, key: issues.keyIn(located.project)(located.issue), commentId: created.id },
          input.attachment_ids,
        );
        return { comment: created, mentioned: mentionCount };
      });
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
      id: number,
      input: UpdateComment,
      hints: OrgHints = {},
    ): Promise<Comment> {
      const located = await issues.locate(principal, key, hints);
      const body = checkBody(input.body_md);
      return edit(principal, located, id, () => body);
    },

    /** A tick is an edit: the same permission, the edited marker, a comment_edited row. */
    async toggleTask(
      principal: Principal,
      key: string,
      id: number,
      task: ToggleTask,
      hints: OrgHints = {},
    ): Promise<Comment> {
      const located = await issues.locate(principal, key, hints);
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

    async remove(principal: Principal, key: string, id: number, hints: OrgHints = {}): Promise<Comment> {
      const located = await issues.locate(principal, key, hints);
      const row = await findComment(located, id);
      requireOwnOrAbove(principal, located, row, 'comment.delete');
      const deleted = await inTransaction(async repos => {
        const ctx = located.project.ctx;
        await lockedOnLiveIssue(repos, located);
        const current = await repos.comments.lockOnIssue(ctx, located.issue.id, id);
        if (!current) throw notFound(located, id);
        const at = now();
        const updated = await repos.comments.update(ctx, id, { deleted_at: at });
        await repos.issues.adjustCommentCount(ctx, located.issue.id, -1);
        await writeMentions(repos, located, current, null);
        // The comment_deleted row covers its files; they are not listed as detached one by one.
        const files = await repos.attachments.softDeleteForComment(ctx, id, at);
        await releaseStorage(repos, ctx, files, access.storageLimit);
        const { activity, change } = event(repos, located, principal.userId, at);
        await recordIssueEvent(activity, change, 'comment_deleted', { new_value: { comment_id: id } });
        return updated!;
      });
      return dto(principal, located, { ...row, comment: deleted });
    },
  };
}

export type CommentsService = ReturnType<typeof commentsService>;
