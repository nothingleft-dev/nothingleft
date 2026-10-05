'use client';

import { useEffect, useRef, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import type { Route } from 'next';
import {
  Eye,
  EyeOff,
  GitFork,
  Link2,
  ListTree,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Star,
  Tag,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Issue, MemberRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { FormAlert } from '@components/auth/form-alert';
import { ConfirmDialog } from '@components/confirm-dialog';
import { RelativeTime } from '@components/relative-time';
import { AttachmentsSection } from '@components/attachments/attachments-section';
import { MarkdownAttachments } from '@components/markdown/markdown-attachments';
import { AddLinksDialog } from '@components/issues/add-links-dialog';
import { CopyIssueButton } from '@components/issues/copy-issue';
import { useCreateIssueDialog } from '@components/issues/create-issue-provider';
import { IssueActivitySection, type TimeTracking } from '@components/issues/issue-activity';
import { IssueDescription } from '@components/issues/issue-description';
import { IssueLinks } from '@components/issues/issue-links';
import { IssueParent } from '@components/issues/issue-parent';
import { IssueReferencedBy } from '@components/issues/issue-referenced-by';
import { IssueSidebar } from '@components/issues/issue-sidebar';
import { SpentTimeDialog } from '@components/issues/spent-time-dialog';
import { IssueTags } from '@components/issues/issue-tags';
import { IssueTitle } from '@components/issues/issue-title';
import { PersonName } from '@components/former-member-chip';
import { useIssueAttachments, useStorage, useUploader } from '@hooks/use-attachments';
import { useDeleteIssue, useIssue, useIssueSignal, useRestoreIssue } from '@hooks/use-issues';
import { useOrganization } from '@hooks/use-organizations';
import { useProject } from '@hooks/use-projects';
import { useRecordRecentlyViewed } from '@hooks/use-recently-viewed';
import { useSession } from '@hooks/use-session';
import { useShortcut } from '@hooks/use-shortcut';
import { isApiError } from '@lib/api/errors';
import { issuePath } from '@lib/issue-path';
import { cn } from '@lib/utils';

export function IssuePage({ issueKey, variant = 'page' }: { issueKey: string; variant?: 'page' | 'modal' }) {
  const modal = variant === 'modal';
  const issue = useIssue(issueKey);
  useRecordRecentlyViewed(issue.data);
  const project = useProject(issue.data?.project.key ?? null);
  const session = useSession();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;
  const [editingDescription, setEditingDescription] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [linking, setLinking] = useState(false);
  const [pickingParent, setPickingParent] = useState(false);
  const [logging, setLogging] = useState(false);
  const { openCreateIssue } = useCreateIssueDialog();
  const user = session.status === 'signed-in' ? session.user : null;
  const organization = useOrganization(user?.current_organization_slug ?? null);
  const attachments = useIssueAttachments(issueKey);
  const storage = useStorage();
  const fileInput = useRef<HTMLInputElement>(null);

  const role = project.data?.my_role;
  const archived = project.data?.is_archived ?? false;
  const canEdit = !archived && (role === 'contributor' || role === 'project_admin');
  const canDelete = !archived && role === 'project_admin';
  const sectionUploader = useUploader(canEdit ? { issue: issue.data?.key ?? issueKey } : null);
  const canAttach = canEdit && storage.available;
  // Most projects track time, so the fields stay while the project loads rather than popping in.
  const tracking = project.data?.time_tracking_enabled ?? true;
  const me: MemberRef | null =
    user && organization.data
      ? {
          username: organization.data.membership.username,
          name: user.name,
          avatar_url: user.avatar_url,
          former_member: false,
          deactivated: false,
        }
      : null;
  const time: TimeTracking = {
    enabled: tracking,
    canLog: tracking && canEdit && me !== null,
    canLogForOthers: role === 'project_admin',
    me,
    onLogTime: () => setLogging(true),
  };

  useShortcut('e', () => setEditingDescription(true), canEdit && !editingDescription);

  // The slug is decoration: rewrite a stale or missing one without a navigation.
  const canonicalPath = issue.data ? issuePath(issue.data) : null;
  useEffect(() => {
    if (modal) return;
    if (canonicalPath && window.location.pathname !== canonicalPath) {
      window.history.replaceState(window.history.state, '', canonicalPath + window.location.search);
    }
  }, [canonicalPath, modal]);

  if (issue.isError && isApiError(issue.error) && issue.error.isNotFound) {
    if (modal) return <FormAlert title={`${issueKey} does not exist, or you cannot open it.`} />;
    notFound();
  }
  if (issue.isError) return <FormAlert title="This issue could not be loaded." />;
  if (issue.isPending) return <IssueSkeleton />;

  const data = issue.data;
  const createSubtask = () => openCreateIssue({ project: data.project.key, parent: data.key });

  return (
    <MarkdownAttachments files={attachments.data ?? []}>
      <div className="grid items-start gap-10 min-[1100px]:grid-cols-[minmax(0,1fr)_var(--rail)]">
        <div className="min-w-0 max-w-[900px]">
          {archived ? (
            <div role="status" className="mb-4 rounded-md bg-inset px-3 py-2 text-xs text-text-secondary">
              {data.project.name} is archived, so this issue is read-only. Starring, voting and watching still work.
            </div>
          ) : null}

          <Provenance issue={data} timeZone={timeZone} withKey={modal} />

          <IssueParent issue={data} canEdit={canEdit} picking={pickingParent} onPickingChange={setPickingParent} />

          <div className="flex items-start gap-4">
            <IssueTitle issue={data} canEdit={canEdit} />
            <div className="mt-0.5 flex flex-none gap-0.5">
              {canEdit ? (
                <>
                  <IconAction label="Edit description" shortcut="e" onClick={() => setEditingDescription(true)}>
                    <Pencil />
                  </IconAction>
                  <IconAction label="Add tag" onClick={() => setTagging(true)}>
                    <Tag />
                  </IconAction>
                  <IconAction label="Add links" onClick={() => setLinking(true)}>
                    <Link2 />
                  </IconAction>
                  <IconAction
                    label="Attach files"
                    disabledReason={storage.blocked}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Paperclip />
                  </IconAction>
                </>
              ) : null}
              <IssueMenu
                issue={data}
                canEdit={canEdit}
                canDelete={canDelete}
                onSetParent={() => setPickingParent(true)}
                onCreateSubtask={createSubtask}
              />
            </div>
          </div>

          <IssueTags issue={data} canEdit={canEdit} pickerOpen={tagging} onPickerOpenChange={setTagging} />

          <IssueDescription
            issue={data}
            canEdit={canEdit}
            editing={editingDescription && canEdit}
            onEditingChange={setEditingDescription}
          />

          <IssueLinks
            issueKey={data.key}
            canEdit={canEdit}
            onAddLinks={() => setLinking(true)}
            onCreateSubtask={createSubtask}
          />

          <IssueReferencedBy issueKey={data.key} timeZone={timeZone} />

          <AttachmentsSection
            issueKey={data.key}
            files={attachments.data}
            loading={attachments.isPending && data.attachment_count > 0}
            uploader={canEdit ? sectionUploader : null}
            onAttach={() => fileInput.current?.click()}
            timeZone={timeZone}
          />
          {canAttach ? (
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              tabIndex={-1}
              aria-hidden
              onChange={event => {
                sectionUploader.start([...(event.target.files ?? [])]);
                event.target.value = '';
              }}
            />
          ) : null}

          <IssueActivitySection issue={data} canComment={canEdit} time={time} timeZone={timeZone} />
        </div>

        {canEdit ? (
          <AddLinksDialog
            open={linking}
            onOpenChange={setLinking}
            issueKey={data.key}
            issueTitle={data.title}
            projectKey={data.project.key}
          />
        ) : null}

        {time.canLog && me ? (
          <SpentTimeDialog
            open={logging}
            onOpenChange={setLogging}
            issue={{ key: data.key, title: data.title }}
            projectKey={data.project.key}
            canLogForOthers={time.canLogForOthers}
            me={me}
            timeZone={timeZone}
          />
        ) : null}

        <IssueSidebar issue={data} canEdit={canEdit} time={time} timeZone={timeZone} />
      </div>
    </MarkdownAttachments>
  );
}

function Provenance({ issue, timeZone, withKey }: { issue: Issue; timeZone?: string; withKey: boolean }) {
  const signal = useIssueSignal(issue.key);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
      {withKey ? (
        <span className="flex items-center gap-0.5">
          <a
            href={issuePath(issue)}
            target="_blank"
            rel="noopener"
            className="font-mono text-xs font-medium text-text hover:underline"
          >
            {issue.key}
          </a>
          <CopyIssueButton issueKey={issue.key} title={issue.title} />
        </span>
      ) : null}
      <span>
        Created by <PersonName person={issue.created_by} className="font-medium text-text" />{' '}
        <RelativeTime value={issue.created_at} timeZone={timeZone} />
      </span>
      <span className="text-text-muted">·</span>
      <span>
        Updated by <PersonName person={issue.updated_by} className="font-medium text-text" />{' '}
        <RelativeTime value={issue.updated_at} timeZone={timeZone} />
      </span>
      <span className="ml-auto flex gap-1">
        <IconAction
          label={issue.me.starred ? 'Starred - you watch this issue' : 'Star (also watches)'}
          pressed={issue.me.starred}
          onClick={() => signal.mutate({ signal: 'star', on: !issue.me.starred })}
        >
          <Star className={cn(issue.me.starred && 'fill-current')} />
        </IconAction>
        <IconAction
          label={issue.me.voted ? 'Remove your vote' : 'Vote'}
          pressed={issue.me.voted}
          onClick={() => signal.mutate({ signal: 'vote', on: !issue.me.voted })}
        >
          <ThumbsUp className={cn(issue.me.voted && 'fill-current')} />
          <span className="text-xs tabular">{issue.vote_count}</span>
        </IconAction>
      </span>
    </div>
  );
}

interface IconActionProps {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  /** Shown instead of the label, with the action turned off. */
  disabledReason?: string | null;
  onClick: () => void;
  children: React.ReactNode;
}

function IconAction({ label, shortcut, pressed, disabledReason, onClick, children }: IconActionProps) {
  const disabled = Boolean(disabledReason);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* aria-disabled rather than disabled: a disabled button fires no pointer events, so its tooltip would never say why. */}
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          aria-disabled={disabled || undefined}
          onClick={disabled ? undefined : onClick}
          className={cn(
            'inline-flex h-control min-w-control items-center justify-center gap-1 rounded-sm px-2 text-text-secondary hover:bg-hover hover:text-text [&_svg]:size-4',
            pressed && 'text-brand-text hover:text-brand-text',
            disabled && 'cursor-not-allowed text-text-disabled hover:bg-transparent hover:text-text-disabled',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className={disabled ? 'max-w-72' : undefined}>
        {disabledReason ?? label}
        {shortcut && !disabled ? <span className="ml-2 text-text-muted">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

interface IssueMenuProps {
  issue: Issue;
  canEdit: boolean;
  canDelete: boolean;
  onSetParent: () => void;
  onCreateSubtask: () => void;
}

function IssueMenu({ issue, canEdit, canDelete, onSetParent, onCreateSubtask }: IssueMenuProps) {
  const router = useRouter();
  const signal = useIssueSignal(issue.key);
  const remove = useDeleteIssue();
  const restore = useRestoreIssue();
  const [confirming, setConfirming] = useState(false);
  const pickParent = useRef(false);

  const onDelete = () =>
    remove.mutate(issue.key, {
      onSuccess: deleted => {
        setConfirming(false);
        router.push(`/projects/${deleted.project.key}` as Route);
        toast.success(`Deleted ${deleted.key}.`, {
          duration: 10_000,
          action: {
            label: 'Undo',
            // The menu has unmounted by now, so per-call mutate callbacks would never fire.
            onClick: () =>
              restore.mutateAsync(deleted.key).then(
                back => router.push(issuePath(back)),
                (error: Error) => toast.error(error.message),
              ),
          },
        });
      },
      onError: error => toast.error(error.message),
    });

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions" className="text-text-secondary">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More: subtasks, copy link, watch, delete</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-52"
        // The parent picker opens only once the menu is gone: opened any earlier, the menu's
        // own dismissal and its focus return to ⋯ close it again.
        onCloseAutoFocus={e => {
          if (!pickParent.current) return;
          pickParent.current = false;
          e.preventDefault();
          onSetParent();
        }}
      >
        {canEdit ? (
          <>
            <DropdownMenuItem onSelect={onCreateSubtask}>
              <ListTree /> Create subtask
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                pickParent.current = true;
              }}
            >
              <GitFork /> {issue.parent ? 'Change parent' : 'Set parent'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            void navigator.clipboard.writeText(new URL(issuePath(issue), window.location.origin).toString());
            toast.success('Link copied.');
          }}
        >
          <Link2 /> Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signal.mutate({ signal: 'watch', on: !issue.me.watching })}>
          {issue.me.watching ? <EyeOff /> : <Eye />}
          {issue.me.watching ? 'Stop watching' : 'Watch'}
        </DropdownMenuItem>
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)} disabled={remove.isPending}>
              <Trash2 /> Delete issue
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${issue.key}?`}
        confirmLabel="Delete issue"
        pending={remove.isPending}
        onConfirm={onDelete}
      >
        <p>
          <span className="font-medium text-text">{issue.title}</span> leaves {issue.project.name} for everyone straight
          away. A Project Admin can restore it from the project&apos;s deleted issues for 14 days; after that it is
          gone, with its history.
        </p>
      </ConfirmDialog>
    </DropdownMenu>
  );
}

function IssueSkeleton() {
  return (
    <div
      className="grid items-start gap-10 min-[1100px]:grid-cols-[minmax(0,1fr)_var(--rail)]"
      role="status"
      aria-label="Loading"
    >
      <div className="flex max-w-[900px] flex-col gap-4">
        <Skeleton className="h-3 w-80" />
        <Skeleton className="h-8 w-2/3" />
        <div className="mt-2 flex flex-col gap-2">
          <Skeleton className="h-4 w-full max-w-[72ch]" />
          <Skeleton className="h-4 w-5/6 max-w-[60ch]" />
          <Skeleton className="h-4 w-3/5 max-w-[48ch]" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5 px-2 py-1">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
