'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Bot, CalendarClock, CheckCheck, ChevronDown, CircleX, FileText, GitMerge, IterationCw } from 'lucide-react';
import type { Notification, NotificationGroup } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { FormerMemberChip } from '@components/former-member-chip';
import { IssueKey } from '@components/issue-key';
import { MemberAvatar } from '@components/issues/member-avatar';
import { RelativeTime } from '@components/relative-time';
import { TextButton, LoadMore } from '@components/text-button';
import { subjectRef, useSubjectNotifications, type MarkTarget } from '@hooks/use-notifications';
import { useOpenNotification } from '@hooks/use-open-notification';
import { formatRelativeShort, type Instant } from '@lib/datetime';
import { DUE_KINDS } from '@lib/notifications/kinds';
import { cn } from '@lib/utils';

interface EntryProps {
  group: NotificationGroup;
  showOrganization: boolean;
  onMark: (target: MarkTarget) => void;
}

// Every row is the same grid: dot · key column · text · place · time · action. The key column is
// sized in the key's own font, so a title after an icon starts where a title after a key does.
const keyColumn = 'flex min-w-[8ch] flex-none items-center font-mono text-2xs max-sm:min-w-[6ch]';

function UnreadDot({ unread, label }: { unread: boolean; label: string }) {
  return (
    <span className="flex h-5 flex-none items-center">
      <span
        role="img"
        aria-label={unread ? label : undefined}
        aria-hidden={unread ? undefined : true}
        className={cn('size-2 rounded-full', unread ? 'bg-brand' : 'bg-transparent')}
      />
    </span>
  );
}

function SubjectMark({ group }: { group: NotificationGroup }) {
  const { subject } = group;
  if (subject.type === 'issue') return <IssueKey issueKey={subject.key} column className="max-sm:min-w-[6ch]" />;
  const Icon = subject.type === 'article' ? FileText : IterationCw;
  return (
    <span className={keyColumn}>
      <Icon
        className="size-icon-sm text-text-secondary"
        aria-label={subject.type === 'article' ? 'Article' : 'Sprint'}
      />
    </span>
  );
}

const titleOf = (group: NotificationGroup) =>
  group.subject.type === 'sprint' ? group.subject.name : group.subject.title;

function MarkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={onClick}
          className="text-text-muted group-hover/row:text-text-secondary hover:text-text"
        >
          <CheckCheck className="size-icon-sm" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function ShortTime({ value, className }: { value: Instant; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const at = value instanceof Date ? value : new Date(value);
  return (
    <time dateTime={at.toISOString()} className={cn('text-text-muted tabular', className)}>
      {formatRelativeShort(at, now)}
    </time>
  );
}

/** Time and the mark action: one right edge for entries and their lines. */
function RowEnd({ at, mark }: { at: Instant; mark: ReactNode }) {
  return (
    <>
      <RelativeTime value={at} className="w-24 flex-none text-right text-xs max-sm:hidden" />
      <ShortTime value={at} className="flex-none text-right text-xs sm:hidden" />
      <span className="flex h-5 w-6 flex-none items-center justify-center">{mark}</span>
    </>
  );
}

export function InboxEntry({ group, showOrganization, onMark }: EntryProps) {
  const [open, setOpen] = useState(false);
  const openLink = useOpenNotification();
  const org = group.subject.organization;
  const unread = group.unread_count > 0;
  const latest = group.notifications[0];
  const expandable = group.count > 1;
  const place = showOrganization ? `${org.name} · ${group.subject.project.name}` : group.subject.project.name;

  return (
    <li className="border-b border-border-subtle">
      <div className="group/row relative flex items-start gap-2 px-2 py-2 hover:bg-hover">
        <UnreadDot unread={unread} label={`${group.unread_count} unread`} />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex h-5 min-w-0 items-center gap-2">
            <SubjectMark group={group} />
            <Link
              href={group.path as Route}
              onClick={event =>
                openLink(event, org.slug, group.path, unread ? () => onMark({ how: 'entry', group }) : undefined)
              }
              className={cn(
                'min-w-0 truncate after:absolute after:inset-0',
                unread ? 'font-medium text-text' : 'text-text-secondary',
              )}
            >
              {titleOf(group)}
            </Link>
            {expandable ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={open ? `Hide the ${group.count} notifications` : `Show the ${group.count} notifications`}
                onClick={() => setOpen(v => !v)}
                className="relative z-10 inline-flex h-4.5 flex-none items-center gap-0.5 rounded-xs border pr-0.5 pl-1 text-2xs leading-4 tabular text-text-secondary hover:border-border-strong hover:text-text"
              >
                {group.count}
                <ChevronDown className={cn('size-3 transition-transform duration-200', open && 'rotate-180')} />
              </button>
            ) : null}
          </span>
          {latest && !open ? (
            <span className="flex min-w-0 items-center gap-2 text-xs text-text-secondary">
              <span className={keyColumn}>
                {latest.actor === null && SYSTEM_KINDS.includes(latest.kind) ? (
                  <SystemMark notification={latest} />
                ) : null}
              </span>
              <span className="min-w-0 truncate">
                {latest.summary}
                <PullRequestTitle notification={latest} />
              </span>
              {latest.actor?.former_member ? <FormerMemberChip /> : null}
            </span>
          ) : null}
        </div>

        <div className="relative z-10 flex h-5 flex-none items-center gap-2 pl-2">
          <span
            title={place}
            className={cn('truncate text-xs text-text-secondary max-md:hidden', showOrganization ? 'w-56' : 'w-40')}
          >
            {place}
          </span>
          <RowEnd
            at={group.latest_at}
            mark={unread ? <MarkButton label="Mark read" onClick={() => onMark({ how: 'entry', group })} /> : null}
          />
        </div>
      </div>

      {open ? <EntryLines group={group} onMark={onMark} /> : null}
    </li>
  );
}

/** Lines up with an entry's text: past the dot and the key column. */
function UnderTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 px-2', className)}>
      <span className="w-2 flex-none" />
      <span className={keyColumn} />
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

function EntryLines({ group, onMark }: { group: NotificationGroup; onMark: (target: MarkTarget) => void }) {
  const [all, setAll] = useState(false);
  const ref = subjectRef(group.subject);
  const more = ref !== null && group.count > group.notifications.length;
  const full = useSubjectNotifications(all ? ref : null);
  const lines = all && full.data ? full.data.pages.flatMap(p => p.data) : group.notifications;

  return (
    <div className="pb-2">
      <ul className="flex flex-col">
        {lines.map(n => (
          <NotificationLine key={n.id} notification={n} group={group} onMark={onMark} />
        ))}
        {all && full.isPending ? <LineSkeletons rows={3} /> : null}
      </ul>
      {all && full.isError ? (
        <UnderTitle className="h-7 text-xs">
          <span className="text-danger-fg">Could not load the rest.</span>
          <TextButton onClick={() => void full.refetch()}>Retry</TextButton>
        </UnderTitle>
      ) : null}
      {more && !all ? (
        <UnderTitle className="mt-1">
          <LoadMore size="xs" onClick={() => setAll(true)}>
            Show all {group.count}
          </LoadMore>
        </UnderTitle>
      ) : null}
      {all && full.hasNextPage ? (
        <UnderTitle className="mt-1">
          <LoadMore size="xs" pending={full.isFetchingNextPage} onClick={() => void full.fetchNextPage()} />
        </UnderTitle>
      ) : null}
    </div>
  );
}

// What nobody did by hand: a provider event, or a status an automation set (actor null).
function SystemMark({ notification }: { notification: Notification }) {
  const kind = notification.kind;
  const Icon = kind === 'pull_request_merged' ? GitMerge : kind === 'ci_failed' ? CircleX : Bot;
  return (
    <Icon
      aria-hidden
      className={cn(
        'size-icon-sm flex-none',
        kind === 'pull_request_merged'
          ? 'c-green text-c-fg'
          : kind === 'ci_failed'
            ? 'text-danger-fg'
            : 'text-text-secondary',
      )}
    />
  );
}

const SYSTEM_KINDS: readonly Notification['kind'][] = [
  'pull_request_merged',
  'ci_failed',
  'status_changed',
  'resolved',
];

/** The pull request's own title, the provider's plain text, after the summary that names it. */
export function PullRequestTitle({ notification }: { notification: Notification }) {
  const title = notification.detail.pull_request_title;
  if (!title) return null;
  return <span className="text-text-muted"> · {title}</span>;
}

function LineMark({ notification }: { notification: Notification }) {
  if (notification.actor) return <MemberAvatar member={notification.actor} className="size-5 flex-none" />;
  if (SYSTEM_KINDS.includes(notification.kind)) return <SystemMark notification={notification} />;
  if (!DUE_KINDS.includes(notification.kind)) return null;
  return (
    <CalendarClock
      aria-hidden
      className={cn(
        'size-icon-sm flex-none',
        notification.kind === 'overdue' ? 'text-danger-fg' : 'text-text-secondary',
      )}
    />
  );
}

export function NotificationLine({
  notification,
  group,
  onMark,
}: {
  notification: Notification;
  group: NotificationGroup;
  onMark: (target: MarkTarget) => void;
}) {
  const openLink = useOpenNotification();
  const unread = notification.read_at === null;
  const org = group.subject.organization.slug;

  return (
    <li className="group/row relative flex items-start gap-2 px-2 py-[5px] hover:bg-hover">
      <UnreadDot unread={unread} label="Unread" />
      <span className={cn(keyColumn, 'h-5')}>
        <LineMark notification={notification} />
      </span>
      <Link
        href={notification.path as Route}
        onClick={event =>
          openLink(
            event,
            org,
            notification.path,
            unread ? () => onMark({ how: 'one', group, notification }) : undefined,
          )
        }
        className={cn(
          'min-w-0 flex-1 text-xs leading-5 after:absolute after:inset-0',
          unread ? 'text-text' : 'text-text-secondary',
        )}
      >
        {notification.summary}
        <PullRequestTitle notification={notification} />
        {notification.actor?.former_member ? <FormerMemberChip className="ml-1.5 align-[1px]" /> : null}
      </Link>
      <div className="relative z-10 flex h-5 flex-none items-center gap-2 pl-2">
        <RowEnd
          at={notification.created_at}
          mark={
            unread ? <MarkButton label="Mark read" onClick={() => onMark({ how: 'one', group, notification })} /> : null
          }
        />
      </div>
    </li>
  );
}

function LineSkeletons({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-start gap-2 px-2 py-[5px]" aria-hidden>
          <span className="w-2 flex-none" />
          <span className={cn(keyColumn, 'h-5')}>
            <Skeleton className="size-5 rounded-full" />
          </span>
          <span className="flex h-5 min-w-0 flex-1 items-center">
            <Skeleton className="h-3 w-full" style={{ maxWidth: `${40 + ((i * 19) % 35)}%` }} />
          </span>
        </li>
      ))}
    </>
  );
}

/** Drawn with the entry's own boxes, so nothing moves when the list arrives. */
export function InboxEntrySkeletons({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="flex flex-col border-t" role="status" aria-label="Loading your inbox">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="border-b border-border-subtle" aria-hidden>
          <div className="flex items-start gap-2 px-2 py-2">
            <span className="w-2 flex-none" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex h-5 min-w-0 items-center gap-2">
                <span className={keyColumn}>
                  <Skeleton className="h-3 w-[5ch]" />
                </span>
                <Skeleton className="h-3" style={{ width: `${30 + ((i * 13) % 30)}%` }} />
              </span>
              <span className="flex h-4.5 min-w-0 items-center gap-2">
                <span className={keyColumn} />
                <Skeleton className="h-2.5" style={{ width: `${40 + ((i * 17) % 30)}%` }} />
              </span>
            </div>
            <div className="flex h-5 flex-none items-center gap-2 pl-2">
              <span className="w-40 max-md:hidden">
                <Skeleton className="h-3 w-24" />
              </span>
              <span className="flex w-24 justify-end max-sm:w-8">
                <Skeleton className="h-3 w-16 max-sm:w-6" />
              </span>
              <span className="w-6" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
