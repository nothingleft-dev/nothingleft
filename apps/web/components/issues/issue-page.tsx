'use client';

import { ArchivedNotice } from '@components/projects/archived-notice';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { parseIssueKey } from '@nothingleft/format';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { FormAlert } from '@components/auth/form-alert';
import { LoadError, errorDetail } from '@components/query-state';
import { ConfirmDialog } from '@components/confirm-dialog';
import { RelativeTime } from '@components/relative-time';
import { AttachmentsSection } from '@components/attachments/attachments-section';
import { MarkdownAttachments } from '@components/markdown/markdown-attachments';
import { AddLinksDialog } from '@components/issues/add-links-dialog';
import { CopyIssueButton } from '@components/issues/copy-issue';
import { useCreateIssueDialog } from '@components/issues/create-issue-provider';
import { IssueActivitySection, type ActivityTab, type TimeTracking } from '@components/issues/issue-activity';
import { DevelopmentPanel } from '@components/git/development-panel';
import { LinkPullRequestDialog } from '@components/git/link-pull-request-dialog';
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
import { toastError } from '@components/toast-error';

const PAGE_GRID =
  'grid items-start gap-10 min-[1100px]:grid-cols-[minmax(0,960px)_var(--rail-slim)] min-[1100px]:justify-center';

export function IssuePage({ issueKey, variant = 'page' }: { issueKey: string; variant?: 'page' | 'modal' }) {
  const modal = variant === 'modal';
  const issue = useIssue(issueKey);
  useRecordRecentlyViewed(issue.data, {
    key: issueKey,
    gone: issue.isError && isApiError(issue.error) && issue.error.isNotFound,
  });
  const project = useProject(issue.data?.project.key ?? null);
  const session = useSession();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;
  const [editingDescription, setEditingDescription] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [linking, setLinking] = useState(false);
  const [pickingParent, setPickingParent] = useState(false);
  const [logging, setLogging] = useState(false);
  const [activityTab, setActivityTab] = useState<ActivityTab>('all');
  const [linkingPullRequest, setLinkingPullRequest] = useState(false);
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
    return <IssueNotFound issueKey={issueKey} />;
  }
  if (issue.isError) {
    return (
      <div className={PAGE_GRID}>
        <LoadError onRetry={() => void issue.refetch()} detail={errorDetail(issue.error)}>
          This issue could not be loaded.
        </LoadError>
      </div>
    );
  }
  // The role decides the title's action strip and so its wrap: drawn without it, the page jumps when it lands.
  if (issue.isPending || project.isPending) return <IssueSkeleton />;

  const data = issue.data;
  const createSubtask = () => openCreateIssue({ project: data.project.key, parent: data.key });
  const summary = data.development;
  // The modal shows the sidebar field only (plan § 13 D); the tab is the full page's.
  const development =
    data.project.git_enabled && !modal
      ? {
          count: summary
            ? summary.pull_requests + summary.branches + (summary.pull_requests === 0 ? summary.commits : 0)
            : 0,
          panel: (
            <DevelopmentPanel
              issueKey={data.key}
              issueTitle={data.title}
              projectKey={data.project.key}
              canLink={canEdit}
              canAdminProject={role === 'project_admin'}
              onLink={() => setLinkingPullRequest(true)}
              timeZone={timeZone}
            />
          ),
        }
      : null;

  return (
    <MarkdownAttachments files={attachments.data ?? []}>
      <div className={PAGE_GRID}>
        <div className="@container min-w-0">
          {archived ? (
            <div className="mb-4">
              <ArchivedNotice>
                {data.project.name} is archived, so this issue is read-only. Starring, voting and watching still work.
              </ArchivedNotice>
            </div>
          ) : null}

          <Provenance issue={data} timeZone={timeZone} withKey={modal} />

          <IssueParent issue={data} canEdit={canEdit} picking={pickingParent} onPickingChange={setPickingParent} />

          <div className="flex items-start gap-4 max-sm:flex-col max-sm:gap-1">
            <IssueTitle issue={data} canEdit={canEdit} />
            <div className="mt-0.5 flex flex-none items-center gap-0.5">
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

          <IssueSidebar part="primary" issue={data} canEdit={canEdit} time={time} timeZone={timeZone} />
          <button
            type="button"
            onClick={() => document.getElementById('issue-fields')?.scrollIntoView({ behavior: 'smooth' })}
            className="mt-1.5 text-xs text-text-secondary hover:text-text hover:underline min-[1100px]:hidden"
          >
            More fields ↓
          </button>

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

          <IssueActivitySection
            issue={data}
            canComment={canEdit}
            time={time}
            development={development}
            tab={activityTab}
            onTabChange={setActivityTab}
            timeZone={timeZone}
          />
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

        {canEdit && data.project.git_enabled ? (
          <LinkPullRequestDialog open={linkingPullRequest} onOpenChange={setLinkingPullRequest} issueKey={data.key} />
        ) : null}

        <IssueSidebar
          part="rest"
          issue={data}
          canEdit={canEdit}
          time={time}
          timeZone={timeZone}
          onOpenDevelopment={modal ? undefined : () => setActivityTab('development')}
          onLinkPullRequest={canEdit ? () => setLinkingPullRequest(true) : undefined}
        />
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
      <span aria-hidden className="text-text-muted max-sm:hidden">
        ·
      </span>
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
                (error: Error) => toastError(`Could not restore ${deleted.key}`, error),
              ),
          },
        });
      },
      onError: error => toastError(`Could not delete ${issue.key}`, error),
    });

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More actions"
              className="text-text-secondary max-md:size-control"
            >
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
        pendingLabel="Deleting…"
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

const STRIP_CELLS = ['w-20', 'w-16', 'w-16', 'w-24', 'w-20', 'w-24'];

function IssueSkeleton() {
  return (
    <div className={PAGE_GRID} role="status" aria-label="Loading">
      <div className="@container min-w-0">
        <div className="mb-4 flex h-8 items-center justify-between gap-4">
          <Skeleton className="h-3 w-96 max-w-[70%]" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex h-8 items-center">
          <Skeleton className="h-6 w-2/3" />
        </div>
        <div className="mt-2 flex h-5 gap-1.5">
          <Skeleton className="h-5 w-16 rounded-sm" />
          <Skeleton className="h-5 w-12 rounded-sm" />
        </div>
        <div className="key-strip mt-4 grid-cols-2! @[26rem]:grid-cols-3! @[46rem]:grid-cols-6!">
          {STRIP_CELLS.map((width, i) => (
            <div key={i} className="flex flex-col gap-0.5 px-3 py-2">
              <span className="flex h-4 items-center">
                <Skeleton className="h-2.5 w-12" />
              </span>
              <span className="flex h-5 items-center">
                <Skeleton className={cn('h-3.5', width)} />
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-3">
          <Skeleton className="h-4 w-full max-w-[72ch]" />
          <Skeleton className="h-4 w-5/6 max-w-[60ch]" />
          <Skeleton className="h-4 w-3/5 max-w-[48ch]" />
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-0.5 px-2 py-[7px]">
            <span className="flex h-4 items-center">
              <Skeleton className="h-2.5 w-16" />
            </span>
            <span className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-28" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Missing and denied read the same (docs/permissions.md); a deleted issue is missing until it is restored. */
function IssueNotFound({ issueKey }: { issueKey: string }) {
  const projectKey = parseIssueKey(issueKey)?.projectKey ?? null;
  const project = useProject(projectKey);
  const found = project.data;

  return (
    <div className="flex max-w-lg flex-col items-start gap-3 pt-12">
      <p className="font-mono text-2xs text-text-muted">404</p>
      <h1 className="text-xl font-semibold tracking-tight">
        <span className="font-mono">{issueKey}</span> does not exist
      </h1>
      <p className="text-pretty text-text-secondary">
        {found
          ? `There is no issue ${issueKey} in ${found.name} that you can open. A deleted issue can be restored by a Project Admin for 14 days.`
          : 'The key may be wrong, or the issue is in a project you cannot open. Your data is unaffected.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {found ? (
          <>
            <Button asChild variant="outline">
              <Link href={`/projects/${found.key}/issues` as Route}>Back to {found.name} issues</Link>
            </Button>
            {found.my_role === 'project_admin' ? (
              <Button asChild variant="ghost">
                <Link href={`/projects/${found.key}/settings?tab=deleted` as Route}>Deleted issues</Link>
              </Button>
            ) : null}
          </>
        ) : project.isPending && projectKey ? (
          <Skeleton className="h-control w-48" />
        ) : (
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
