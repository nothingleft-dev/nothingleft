'use client';

import { useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Timer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { checkMarkdownSize } from '@nothingleft/markdown';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { ConfirmDialog } from '@components/confirm-dialog';
import { MarkdownEditor } from '@components/editor/markdown-editor';
import { PersonName } from '@components/former-member-chip';
import { Kbd } from '@components/kbd';
import { Markdown } from '@components/markdown/markdown';
import { RelativeTime } from '@components/relative-time';
import { MarkdownSizeNote } from '@components/issues/markdown-size-note';
import { MemberAvatar } from '@components/issues/member-avatar';
import { useUploader } from '@hooks/use-attachments';
import {
  useCreateComment,
  useDeleteComment,
  useToggleCommentTask,
  useUpdateComment,
  type CommentScope,
  type ThreadComment,
} from '@hooks/use-comments';
import { useSession } from '@hooks/use-session';
import { isApiError } from '@lib/api/errors';
import { formatDateTimeWithZone } from '@lib/datetime';

const SUBMIT_KBD = 'h-4 border-transparent bg-ink-fg/15 text-ink-fg/80';

interface CommentHeaderProps {
  comment: ThreadComment;
  verb?: string;
  timeZone?: string;
}

export function CommentHeader({ comment, verb = 'commented', timeZone }: CommentHeaderProps) {
  return (
    <>
      <PersonName person={comment.author} className="font-medium text-text" />
      <span>{verb}</span>
      <RelativeTime value={comment.created_at} timeZone={timeZone} />
      {comment.edited_at ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="text-text-muted">
              · edited
            </span>
          </TooltipTrigger>
          <TooltipContent>Edited {formatDateTimeWithZone(comment.edited_at, timeZone)}</TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
}

const commentFilesTarget = (scope: CommentScope, commentId: number) =>
  'issue' in scope
    ? { issue: scope.issue, comment_id: commentId }
    : { project: scope.project, article: scope.article, comment_id: commentId };

interface CommentBodyProps {
  scope: CommentScope;
  projectKey: string;
  comment: ThreadComment;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

export function CommentBody({ scope, projectKey, comment, editing, onEditingChange }: CommentBodyProps) {
  const toggle = useToggleCommentTask(scope);
  if (editing) {
    return (
      <CommentEditForm scope={scope} projectKey={projectKey} comment={comment} onDone={() => onEditingChange(false)} />
    );
  }
  return (
    <Markdown
      source={comment.body_md}
      variant="comment"
      className="mt-1"
      onToggleTask={
        comment.me.can_edit
          ? (index, checked) =>
              toggle.mutate({ id: comment.id, index, checked }, { onError: error => toast.error(error.message) })
          : undefined
      }
    />
  );
}

interface CommentMenuProps {
  scope: CommentScope;
  /** What the comment is on, as a reader names it: `PP-12`, or an article's title. */
  subject: string;
  comment: ThreadComment;
  onEdit: () => void;
}

export function CommentMenu({ scope, subject, comment, onEdit }: CommentMenuProps) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteComment(scope);
  if (!comment.me.can_edit && !comment.me.can_delete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Comment actions"
            className="ml-auto text-text-muted opacity-0 group-hover/comment:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {comment.me.can_edit ? (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit comment
            </DropdownMenuItem>
          ) : null}
          {comment.me.can_edit && comment.me.can_delete ? <DropdownMenuSeparator /> : null}
          {comment.me.can_delete ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
              <Trash2 /> Delete comment
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this comment?"
        confirmLabel="Delete comment"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(comment.id, {
            onSuccess: () => setConfirming(false),
            onError: error => {
              setConfirming(false);
              toast.error(error.message);
            },
          })
        }
      >
        <p>
          The comment by <span className="font-medium text-text">{comment.author.name}</span> disappears from {subject}{' '}
          for everyone, and cannot be restored.{' '}
          {'issue' in scope ? 'The history keeps one line saying a comment was deleted.' : null}
        </p>
      </ConfirmDialog>
    </>
  );
}

interface CommentEditFormProps {
  scope: CommentScope;
  projectKey: string;
  comment: ThreadComment;
  onDone: () => void;
}

function CommentEditForm({ scope, projectKey, comment, onDone }: CommentEditFormProps) {
  const [text, setText] = useState(comment.body_md);
  const update = useUpdateComment(scope);
  const uploader = useUploader(commentFilesTarget(scope, comment.id));
  const size = checkMarkdownSize(text);
  const empty = text.trim() === '';
  const blocked = empty || size.level === 'too_large' || uploader.busy;

  const submit = () => {
    if (blocked) return;
    if (text !== comment.body_md) {
      // Shown saved at once; a refusal puts the old text back and says why.
      update.mutate({ id: comment.id, body_md: text }, { onError: e => toast.error(e.message) });
    }
    onDone();
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <MarkdownEditor
        value={text}
        onChange={setText}
        projectKey={projectKey}
        label="Edit comment"
        placeholder="A comment cannot be empty. To remove it, delete it instead."
        autoFocus
        invalid={size.level === 'too_large'}
        onSubmit={submit}
        onCancel={onDone}
        uploader={uploader}
        footer={
          <>
            <Button size="sm" onClick={submit} disabled={blocked}>
              {uploader.busy ? 'Uploading…' : 'Save'} <Kbd className={SUBMIT_KBD}>⌘↵</Kbd>
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </>
        }
      />
      <MarkdownSizeNote size={size} />
    </div>
  );
}

interface CommentComposerProps {
  scope: CommentScope;
  projectKey: string;
  /** Absent when the viewer cannot log time here, or the project does not track it. */
  onLogTime?: (() => void) | undefined;
}

export function CommentComposer({ scope, projectKey, onLogTime }: CommentComposerProps) {
  const session = useSession();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateComment(scope);
  // Files dropped into a comment not yet posted are drafts, claimed when it is.
  const uploader = useUploader({ project: projectKey });
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const size = checkMarkdownSize(text);
  const empty = text.trim() === '';
  const me = session.status === 'signed-in' ? session.user : null;
  const blocked = empty || size.level === 'too_large' || uploader.busy;

  const discard = () => {
    setText('');
    uploader.finish('');
  };

  const submit = () => {
    if (blocked || !me) return;
    // The same text retried keeps its key, so a dropped response cannot post it twice.
    if (attempt.current?.body !== text) attempt.current = { body: text, key: crypto.randomUUID() };
    const body = text;
    setError(null);
    setText('');
    create.mutate(
      {
        body_md: body,
        attachment_ids: uploader.claimable(body),
        idempotencyKey: attempt.current.key,
        author: { username: '', name: me.name, avatar_url: me.avatar_url, former_member: false, deactivated: false },
      },
      {
        onSuccess: () => {
          attempt.current = null;
          uploader.finish(body);
        },
        onError: e => {
          setText(body);
          setError(isApiError(e) ? e.message : 'The comment could not be posted.');
        },
      },
    );
  };

  return (
    <div className="mt-4 grid grid-cols-[32px_minmax(0,1fr)] gap-3">
      {me ? <MemberAvatar member={me} className="mt-1 size-avatar-lg" /> : <span />}
      <div className="flex min-w-0 flex-col gap-2">
        <MarkdownEditor
          value={text}
          onChange={setText}
          projectKey={projectKey}
          label="Comment"
          placeholder="Write a comment. Type @ to mention someone, # to link an issue."
          invalid={Boolean(error) || size.level === 'too_large'}
          onSubmit={submit}
          onCancel={empty ? undefined : discard}
          uploader={uploader}
          footer={
            <>
              <Button size="sm" onClick={submit} disabled={blocked}>
                {uploader.busy ? 'Uploading…' : 'Add comment'} <Kbd className={SUBMIT_KBD}>⌘↵</Kbd>
              </Button>
              {empty ? null : (
                <Button size="sm" variant="ghost" onClick={discard}>
                  Cancel
                </Button>
              )}
              {onLogTime ? (
                <Button size="sm" variant="outline" className="ml-auto" onClick={onLogTime}>
                  <Timer /> Add spent time
                </Button>
              ) : null}
            </>
          }
        />
        <MarkdownSizeNote size={size} />
        {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
      </div>
    </div>
  );
}
