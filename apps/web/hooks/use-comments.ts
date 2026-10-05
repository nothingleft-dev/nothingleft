'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { toggleTaskItem } from '@nothingleft/markdown';
import type {
  Article,
  ArticleComment,
  Comment,
  CreateComment,
  Issue,
  IssueActivity,
  MemberRef,
  SuccessEnvelope,
  ToggleTask,
} from '@nothingleft/types';
import {
  createArticleComment,
  deleteArticleComment,
  listArticleComments,
  toggleArticleCommentTask,
  updateArticleComment,
} from '@lib/api/articles';
import { createComment, deleteComment, listComments, toggleCommentTask, updateComment } from '@lib/api/comments';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

/** What a thread hangs on: an issue, or a knowledge base article. */
export type CommentScope = { issue: string } | { project: string; article: string };
export type ThreadComment = Comment | ArticleComment;

type Pages<T> = InfiniteData<SuccessEnvelope<T[]>, string | undefined>;

const isIssue = (scope: CommentScope): scope is { issue: string } => 'issue' in scope;

const commentsKey = (scope: CommentScope) =>
  isIssue(scope) ? queryKeys.issueComments(scope.issue) : queryKeys.articleComments(scope.project, scope.article);

const attachmentsKey = (scope: CommentScope) =>
  isIssue(scope) ? queryKeys.issueAttachments(scope.issue) : queryKeys.articleAttachments(scope.project, scope.article);

const endpoints = (scope: CommentScope) =>
  isIssue(scope)
    ? {
        list: (cursor?: string) => listComments(scope.issue, cursor),
        create: (body: CreateComment, key: string) => createComment(scope.issue, body, key),
        update: (id: number, body_md: string) => updateComment(scope.issue, id, { body_md }),
        remove: (id: number) => deleteComment(scope.issue, id),
        toggle: (id: number, body: ToggleTask) => toggleCommentTask(scope.issue, id, body),
      }
    : {
        list: (cursor?: string) => listArticleComments(scope.project, scope.article, cursor),
        create: (body: CreateComment, key: string) => createArticleComment(scope.project, scope.article, body, key),
        update: (id: number, body_md: string) => updateArticleComment(scope.project, scope.article, id, { body_md }),
        remove: (id: number) => deleteArticleComment(scope.project, scope.article, id),
        toggle: (id: number, body: ToggleTask) => toggleArticleCommentTask(scope.project, scope.article, id, body),
      };

export function useComments(scope: CommentScope, enabled = true) {
  const api = endpoints(scope);
  return useInfiniteQuery<
    SuccessEnvelope<ThreadComment[]>,
    Error,
    Pages<ThreadComment>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: commentsKey(scope),
    refetchInterval: POLL.list,
    queryFn: ({ pageParam }) => api.list(pageParam),
    initialPageParam: undefined,
    getNextPageParam: last => last.meta.pagination?.next_cursor ?? undefined,
    enabled,
  });
}

const mapPages = <T>(data: Pages<T> | undefined, fn: (rows: T[]) => T[]): Pages<T> | undefined =>
  data && { ...data, pages: data.pages.map(page => ({ ...page, data: fn(page.data) })) };

/** An issue comment lives in two caches: the Comments tab and the entries of the All tab that embed it. */
function patchComment(
  client: QueryClient,
  scope: CommentScope,
  id: number,
  fn: (comment: ThreadComment) => ThreadComment | null,
) {
  client.setQueryData<Pages<ThreadComment>>(commentsKey(scope), data =>
    mapPages(data, rows => rows.flatMap(c => (c.id === id ? (fn(c) ?? []) : [c]))),
  );
  if (!isIssue(scope)) return;
  client.setQueriesData<Pages<IssueActivity>>({ queryKey: queryKeys.issueActivity(scope.issue) }, data =>
    mapPages(data, rows =>
      rows.flatMap(row => {
        if (row.comment?.id !== id) return [row];
        const next = fn(row.comment);
        return next ? [{ ...row, comment: next as Comment }] : [];
      }),
    ),
  );
}

// Oldest first: a new row belongs at the end, once the last page is on screen.
function appendToLastPage<T>(data: Pages<T> | undefined, row: T): Pages<T> | undefined {
  if (!data || data.pages.length === 0) return data;
  const last = data.pages.length - 1;
  if (data.pages[last]!.meta.pagination?.next_cursor) return data;
  return { ...data, pages: data.pages.map((page, i) => (i === last ? { ...page, data: [...page.data, row] } : page)) };
}

async function snapshot(client: QueryClient, scope: CommentScope) {
  await client.cancelQueries({ queryKey: commentsKey(scope) });
  if (isIssue(scope)) await client.cancelQueries({ queryKey: queryKeys.issueActivity(scope.issue) });
  return {
    comments: client.getQueryData<Pages<ThreadComment>>(commentsKey(scope)),
    activity: isIssue(scope)
      ? client.getQueriesData<Pages<IssueActivity>>({ queryKey: queryKeys.issueActivity(scope.issue) })
      : [],
  };
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function rollback(client: QueryClient, scope: CommentScope, previous: Snapshot | undefined) {
  if (!previous) return;
  client.setQueryData(commentsKey(scope), previous.comments);
  for (const [queryKey, data] of previous.activity) client.setQueryData(queryKey, data);
}

function settle(client: QueryClient, scope: CommentScope) {
  void client.invalidateQueries({ queryKey: commentsKey(scope) });
  if (isIssue(scope)) void client.invalidateQueries({ queryKey: queryKeys.issueActivity(scope.issue) });
  // A comment's text decides which files are `inline`, and deleting it takes its files with it.
  void client.invalidateQueries({ queryKey: attachmentsKey(scope) });
}

function bumpCount(client: QueryClient, scope: CommentScope, delta: number) {
  if (isIssue(scope)) {
    client.setQueryData<Issue>(
      queryKeys.issue(scope.issue),
      issue => issue && { ...issue, comment_count: Math.max(0, issue.comment_count + delta) },
    );
    return;
  }
  client.setQueryData<Article>(
    queryKeys.article(scope.project, scope.article),
    article => article && { ...article, comment_count: Math.max(0, article.comment_count + delta) },
  );
}

function draftComment(scope: CommentScope, body_md: string, author: MemberRef): ThreadComment {
  const common = {
    id: -Date.now(),
    author,
    body_md,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    me: { can_edit: false, can_delete: false },
  };
  return isIssue(scope)
    ? { ...common, issue: scope.issue }
    : { ...common, article: { project: scope.project, slug: scope.article } };
}

export function useCreateComment(scope: CommentScope) {
  const client = useQueryClient();
  const api = endpoints(scope);
  return useMutation({
    mutationFn: ({
      body_md,
      attachment_ids,
      idempotencyKey,
    }: {
      body_md: string;
      attachment_ids?: string[];
      idempotencyKey: string;
      author: MemberRef;
    }) =>
      api.create({ body_md, ...(attachment_ids?.length ? { attachment_ids } : {}) }, idempotencyKey).then(r => r.data),
    onMutate: async ({ body_md, author }) => {
      const previous = await snapshot(client, scope);
      const draft = draftComment(scope, body_md, author);
      client.setQueryData<Pages<ThreadComment>>(commentsKey(scope), data => appendToLastPage(data, draft));
      if (isIssue(scope)) {
        const entry: IssueActivity = {
          id: draft.id,
          kind: 'commented',
          actor: { ...author, username: author.username || null },
          change_group_id: `pending-${draft.id}`,
          field: null,
          old_value: null,
          people: [],
          new_value: null,
          created_at: draft.created_at,
          updated_at: draft.created_at,
          comment: draft as Comment,
        };
        client.setQueryData<Pages<IssueActivity>>(queryKeys.issueActivityOf(scope.issue, 'all'), data =>
          appendToLastPage(data, entry),
        );
      }
      return previous;
    },
    onError: (_error, _input, previous) => rollback(client, scope, previous),
    onSuccess: () => bumpCount(client, scope, 1),
    onSettled: () => {
      settle(client, scope);
      // Commenting watches the subject; on an issue it also moves its updated time.
      const subject = isIssue(scope) ? queryKeys.issue(scope.issue) : queryKeys.article(scope.project, scope.article);
      void client.invalidateQueries({ queryKey: subject, exact: true });
    },
  });
}

export function useUpdateComment(scope: CommentScope) {
  const client = useQueryClient();
  const api = endpoints(scope);
  return useMutation({
    mutationFn: ({ id, body_md }: { id: number; body_md: string }) => api.update(id, body_md).then(r => r.data),
    onMutate: async ({ id, body_md }) => {
      const previous = await snapshot(client, scope);
      patchComment(client, scope, id, c => ({ ...c, body_md, edited_at: c.edited_at ?? new Date().toISOString() }));
      return previous;
    },
    onError: (_error, _input, previous) => rollback(client, scope, previous),
    onSuccess: comment => patchComment(client, scope, comment.id, () => comment),
    onSettled: () => settle(client, scope),
  });
}

export function useToggleCommentTask(scope: CommentScope) {
  const client = useQueryClient();
  const api = endpoints(scope);
  return useMutation({
    mutationFn: ({ id, index, checked }: { id: number; index: number; checked: boolean }) =>
      api.toggle(id, { index, checked }).then(r => r.data),
    onMutate: async ({ id, index, checked }) => {
      const previous = await snapshot(client, scope);
      patchComment(client, scope, id, c => ({ ...c, body_md: toggleTaskItem(c.body_md, index, checked) }));
      return previous;
    },
    onError: (_error, _input, previous) => rollback(client, scope, previous),
    onSuccess: comment => patchComment(client, scope, comment.id, () => comment),
    onSettled: () => settle(client, scope),
  });
}

export function useDeleteComment(scope: CommentScope) {
  const client = useQueryClient();
  const api = endpoints(scope);
  return useMutation({
    mutationFn: (id: number) => api.remove(id).then(r => r.data),
    onMutate: async id => {
      const previous = await snapshot(client, scope);
      patchComment(client, scope, id, () => null);
      return previous;
    },
    onError: (_error, _input, previous) => rollback(client, scope, previous),
    onSuccess: () => bumpCount(client, scope, -1),
    onSettled: () => settle(client, scope),
  });
}
