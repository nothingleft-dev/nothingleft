'use client';

import { useState } from 'react';
import type { Article } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { EmptyState } from '@components/empty-state';
import { CommentBody, CommentComposer, CommentHeader, CommentMenu } from '@components/issues/issue-comments';
import { MemberAvatar } from '@components/issues/member-avatar';
import { useComments, type CommentScope, type ThreadComment } from '@hooks/use-comments';
import { cn } from '@lib/utils';

export function ArticleComments({ article, timeZone }: { article: Article; timeZone?: string | undefined }) {
  const scope: CommentScope = { project: article.project.key, article: article.slug };
  const comments = useComments(scope);
  const rows = (comments.data?.pages ?? []).flatMap(p => p.data);

  return (
    <section aria-labelledby="article-comments" className="mt-10 max-w-[900px] border-t pt-5">
      <h2 id="article-comments" className="flex items-baseline gap-2 font-semibold">
        Comments <span className="tabular text-xs font-normal text-text-muted">{article.comment_count}</span>
      </h2>

      {comments.isPending ? (
        <div className="mt-3 flex flex-col gap-4" aria-hidden>
          {[0, 1].map(i => (
            <div key={i} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
              <Skeleton className="size-avatar-lg rounded-full" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.isError ? (
        <EmptyState className="mt-3" title="The comments could not be loaded." description={comments.error.message} />
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-text-secondary">
          {article.me.can_comment ? 'No comments yet. Start the conversation below.' : 'No comments yet.'}
        </p>
      ) : (
        <ol className="mt-1">
          {rows.map(comment => (
            <Entry
              key={comment.id}
              scope={scope}
              projectKey={article.project.key}
              subject={article.title}
              comment={comment}
              timeZone={timeZone}
            />
          ))}
        </ol>
      )}
      {comments.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={comments.isFetchingNextPage}
          onClick={() => void comments.fetchNextPage()}
        >
          {comments.isFetchingNextPage ? 'Loading more…' : 'Show later comments'}
        </Button>
      ) : null}

      {article.me.can_comment ? <CommentComposer scope={scope} projectKey={article.project.key} /> : null}
    </section>
  );
}

interface EntryProps {
  scope: CommentScope;
  projectKey: string;
  subject: string;
  comment: ThreadComment;
  timeZone?: string | undefined;
}

function Entry({ scope, projectKey, subject, comment, timeZone }: EntryProps) {
  const [editing, setEditing] = useState(false);
  const pending = comment.id < 0;
  return (
    <li className={cn('group/comment grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-3', pending && 'opacity-60')}>
      <MemberAvatar member={comment.author} className="size-avatar-lg" />
      <div className="min-w-0">
        <div className="flex min-h-8 flex-wrap items-center gap-x-2 text-xs text-text-secondary">
          <CommentHeader comment={comment} timeZone={timeZone} />
          {pending || editing ? null : (
            <CommentMenu scope={scope} subject={subject} comment={comment} onEdit={() => setEditing(true)} />
          )}
        </div>
        <CommentBody
          scope={scope}
          projectKey={projectKey}
          comment={comment}
          editing={editing}
          onEditingChange={setEditing}
        />
      </div>
    </li>
  );
}
