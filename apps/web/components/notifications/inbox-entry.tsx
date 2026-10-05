'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { CalendarClock, CheckCheck, ChevronRight, FileText, Timer } from 'lucide-react';
import type { Notification, NotificationGroup } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { FormerMemberChip } from '@components/former-member-chip';
import { IssueKey } from '@components/issue-key';
import { MemberAvatar } from '@components/issues/member-avatar';
import { RelativeTime } from '@components/relative-time';
import { subjectRef, useSubjectNotifications, type MarkTarget } from '@hooks/use-notifications';
import { useOpenNotification } from '@hooks/use-open-notification';
import { DUE_KINDS } from '@lib/notifications/kinds';
import { cn } from '@lib/utils';

interface EntryProps {
  group: NotificationGroup;
  showOrganization: boolean;
  onMark: (target: MarkTarget) => void;
}

function UnreadDot({ unread, label }: { unread: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={unread ? label : undefined}
      aria-hidden={unread ? undefined : true}
      className={cn('size-2 flex-none rounded-full', unread ? 'bg-brand' : 'bg-transparent')}
    />
  );
}

function SubjectMark({ group }: { group: NotificationGroup }) {
  const { subject } = group;
  if (subject.type === 'issue') return <IssueKey issueKey={subject.key} className="flex-none" />;
  const Icon = subject.type === 'article' ? FileText : Timer;
  return (
    <Icon
      className="size-icon-sm flex-none text-text-secondary"
      aria-label={subject.type === 'article' ? 'Article' : 'Sprint'}
    />
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
          className="text-text-secondary opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
        >
          <CheckCheck className="size-icon-sm" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
      <div className="group/row flex items-start gap-2 px-2 py-2 hover:bg-hover">
        <div className="flex h-5 w-6 flex-none items-center justify-center">
          {expandable ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-expanded={open}
              aria-label={open ? 'Collapse' : `Show the ${group.count} notifications`}
              onClick={() => setOpen(v => !v)}
              className="text-text-muted"
            >
              <ChevronRight className={cn('size-icon-sm transition-transform duration-200', open && 'rotate-90')} />
            </Button>
          ) : null}
        </div>
        <div className="flex h-5 flex-none items-center">
          <UnreadDot unread={unread} label={`${group.unread_count} unread`} />
        </div>

        <Link
          href={group.path as Route}
          onClick={event => {
            if (unread) onMark({ how: 'entry', group });
            openLink(event, org.slug, group.path);
          }}
          className="flex min-w-0 flex-1 flex-col gap-0.5"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SubjectMark group={group} />
            <span className={cn('truncate', unread ? 'font-medium text-text' : 'text-text-secondary')}>
              {titleOf(group)}
            </span>
            {expandable ? (
              <span className="flex-none rounded-xs border px-1 text-2xs leading-4 tabular text-text-secondary">
                {group.count}
              </span>
            ) : null}
          </span>
          {latest ? (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
              <span className="truncate">{latest.summary}</span>
              {latest.actor?.former_member ? <FormerMemberChip /> : null}
            </span>
          ) : null}
        </Link>

        <div className="flex flex-none items-center gap-3 pl-2">
          <span className="max-w-56 truncate text-xs text-text-secondary max-md:hidden">{place}</span>
          <RelativeTime value={group.latest_at} className="w-24 text-right text-xs max-sm:w-auto" />
          <div className="w-6">
            {unread ? (
              <MarkButton
                label={group.unread_count === 1 ? 'Mark read' : `Mark ${group.unread_count} read`}
                onClick={() => onMark({ how: 'entry', group })}
              />
            ) : null}
          </div>
        </div>
      </div>

      {open ? <EntryLines group={group} onMark={onMark} /> : null}
    </li>
  );
}

function EntryLines({ group, onMark }: { group: NotificationGroup; onMark: (target: MarkTarget) => void }) {
  const [all, setAll] = useState(false);
  const ref = subjectRef(group.subject);
  const more = ref !== null && group.count > group.notifications.length;
  const full = useSubjectNotifications(all ? ref : null);
  const lines = all && full.data ? full.data.pages.flatMap(p => p.data) : group.notifications;

  return (
    <div className="pb-2 pl-[52px]">
      <ul className="flex flex-col border-l">
        {lines.map(n => (
          <NotificationLine key={n.id} notification={n} group={group} onMark={onMark} />
        ))}
        {all && full.isPending ? <LineSkeletons rows={3} /> : null}
      </ul>
      {all && full.isError ? (
        <p className="py-1 pl-3 text-xs text-danger-fg">
          The rest could not be loaded. Collapse the entry and try again.
        </p>
      ) : null}
      {more && !all ? (
        <Button variant="ghost" size="xs" className="mt-1 ml-1 text-text-secondary" onClick={() => setAll(true)}>
          Show all {group.count}
        </Button>
      ) : null}
      {all && full.hasNextPage ? (
        <Button
          variant="ghost"
          size="xs"
          className="mt-1 ml-1 text-text-secondary"
          disabled={full.isFetchingNextPage}
          onClick={() => void full.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function LineMark({ notification }: { notification: Notification }) {
  if (notification.actor) return <MemberAvatar member={notification.actor} className="size-5 flex-none" />;
  const overdue = notification.kind === 'overdue';
  return (
    <span
      className={cn(
        'grid size-5 flex-none place-items-center rounded-full bg-inset',
        overdue ? 'text-danger-fg' : 'text-text-secondary',
      )}
      aria-hidden
    >
      {DUE_KINDS.includes(notification.kind) ? <CalendarClock className="size-3" /> : null}
    </span>
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
    <li className="group/row flex items-start gap-2 rounded-r-sm py-1.5 pr-2 pl-3 hover:bg-hover">
      <div className="flex h-5 flex-none items-center">
        <UnreadDot unread={unread} label="Unread" />
      </div>
      <LineMark notification={notification} />
      <Link
        href={notification.path as Route}
        onClick={event => {
          if (unread) onMark({ how: 'one', group, notification });
          openLink(event, org, notification.path);
        }}
        className={cn('min-w-0 flex-1 leading-5', unread ? 'text-text' : 'text-text-secondary')}
      >
        {notification.summary}
        {notification.actor?.former_member ? <FormerMemberChip className="ml-1.5 align-[1px]" /> : null}
      </Link>
      <RelativeTime value={notification.created_at} className="flex-none text-xs leading-5" />
      <div className="w-6 flex-none">
        {unread ? <MarkButton label="Mark read" onClick={() => onMark({ how: 'one', group, notification })} /> : null}
      </div>
    </li>
  );
}

function LineSkeletons({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-2 py-1.5 pl-3" aria-hidden>
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${40 + ((i * 19) % 35)}%` }} />
        </li>
      ))}
    </>
  );
}

export function InboxEntrySkeletons({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="flex flex-col border-t" role="status" aria-label="Loading your inbox">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-start gap-2 border-b border-border-subtle px-2 py-2.5" aria-hidden>
          <span className="w-6" />
          <Skeleton className="mt-1.5 size-2 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3" style={{ width: `${30 + ((i * 13) % 30)}%` }} />
            </div>
            <Skeleton className="h-2.5" style={{ width: `${40 + ((i * 17) % 30)}%` }} />
          </div>
          <Skeleton className="h-3 w-28 max-md:hidden" />
          <Skeleton className="h-3 w-16" />
        </li>
      ))}
    </ul>
  );
}
