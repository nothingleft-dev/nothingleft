'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDuration } from '@nothingleft/format';
import type { Issue, MemberRef, WorkItem } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Duration } from '@components/duration';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Skeleton } from '@components/ui/skeleton';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { LetterBadge } from '@components/letter-badge';
import { PersonName } from '@components/former-member-chip';
import { Markdown } from '@components/markdown/markdown';
import { MemberAvatar } from '@components/issues/member-avatar';
import { SpentTimeDialog } from '@components/issues/spent-time-dialog';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { useDeleteWorkItem, useWorkItems } from '@hooks/use-work-items';
import { formatCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';

interface IssueSpentTimeProps {
  issue: Issue;
  canLog: boolean;
  canLogForOthers: boolean;
  me: MemberRef | null;
  onLogTime: () => void;
  timeZone?: string;
}

/** This issue's records and its subtasks', so the rows add up to the total above them. */
export function IssueSpentTime({ issue, canLog, canLogForOthers, me, onLogTime, timeZone }: IssueSpentTimeProps) {
  const records = useWorkItems(issue.key, true);
  const calendar = useWorkCalendar();
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const rows = (records.data?.pages ?? []).flatMap(p => p.data);
  const total = records.data?.pages[0]?.meta.pagination?.total ?? rows.length;

  if (records.isPending) return <SpentTimeSkeleton />;
  if (records.isError) {
    return (
      <EmptyState className="mt-3" title="The spent time could not be loaded." description={records.error.message} />
    );
  }

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-xs text-text-secondary">
      <span>
        Total{' '}
        <b className="font-mono text-sm font-medium tabular text-text">
          {issue.spent_minutes > 0 ? formatDuration(issue.spent_minutes, calendar) : '0m'}
        </b>
      </span>
      {issue.estimate_minutes !== null ? (
        <span>
          of <Duration minutes={issue.estimate_minutes} calendar={calendar} className="text-text" /> estimated
        </span>
      ) : null}
      <span className="text-text-muted">
        {total} {total === 1 ? 'record' : 'records'}
      </span>
      {canLog ? (
        <Button size="sm" variant="outline" className="ml-auto" onClick={onLogTime}>
          <Plus /> Add spent time
        </Button>
      ) : null}
    </div>
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        className="mt-3"
        title="No spent time yet."
        description={
          canLog
            ? 'Log the time you spend on this issue, or on its subtasks, and it adds up here.'
            : 'Time people log on this issue and its subtasks will appear here.'
        }
        action={
          canLog ? (
            <Button size="sm" variant="outline" onClick={onLogTime}>
              <Plus /> Add spent time
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <>
      {header}
      <ol className="divide-y divide-border-subtle border-y">
        {rows.map(row => (
          <SpentTimeRow
            key={row.id}
            item={row}
            ownIssue={row.issue === issue.key}
            durationText={formatDuration(row.duration_minutes, calendar)}
            onEdit={() => setEditing(row)}
          />
        ))}
      </ol>
      {records.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={records.isFetchingNextPage}
          onClick={() => void records.fetchNextPage()}
        >
          {records.isFetchingNextPage ? 'Loading more…' : 'Show later records'}
        </Button>
      ) : null}
      {me && editing ? (
        <SpentTimeDialog
          open
          onOpenChange={open => {
            if (!open) setEditing(null);
          }}
          issue={{ key: issue.key, title: issue.title }}
          projectKey={issue.project.key}
          canLogForOthers={canLogForOthers}
          me={me}
          timeZone={timeZone}
          item={editing}
        />
      ) : null}
    </>
  );
}

interface SpentTimeRowProps {
  item: WorkItem;
  ownIssue: boolean;
  durationText: string;
  onEdit: () => void;
}

function SpentTimeRow({ item, ownIssue, durationText, onEdit }: SpentTimeRowProps) {
  const onBehalf = item.created_by.username !== item.author.username;
  return (
    <li className="group/record grid grid-cols-[24px_minmax(0,1fr)_auto] gap-x-3 py-2.5">
      <MemberAvatar member={item.author} className="mt-0.5 size-6" />
      <div className="min-w-0">
        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-secondary">
          <PersonName person={item.author} className="font-medium text-text" />
          <span>{formatCalendarDate(item.work_date)}</span>
          {ownIssue ? null : (
            <Link href={`/issue/${item.issue}` as Route} className="font-mono text-2xs text-text hover:underline">
              {item.issue}
            </Link>
          )}
          {onBehalf ? (
            <span className="text-text-muted">
              logged by <PersonName person={item.created_by} />
            </span>
          ) : null}
        </div>
        {item.description_md.trim() ? (
          <Markdown source={item.description_md} variant="comment" className="mt-0.5" />
        ) : null}
      </div>
      <div className="flex h-6 items-center gap-2">
        {item.work_type ? (
          <LetterBadge letter={item.work_type.short_label} label={item.work_type.name} variant="outlined" />
        ) : null}
        {item.attributes.map(a => (
          <LetterBadge
            key={a.attribute}
            letter={a.value.short_label}
            label={`${a.attribute}: ${a.value.name}`}
            variant="outlined"
          />
        ))}
        <span className="min-w-12 text-right font-mono text-xs font-medium tabular">{durationText}</span>
        <RecordMenu item={item} durationText={durationText} onEdit={onEdit} />
      </div>
    </li>
  );
}

function RecordMenu({ item, durationText, onEdit }: { item: WorkItem; durationText: string; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteWorkItem();
  if (!item.me.can_edit && !item.me.can_delete) return <span className="w-6" />;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${durationText} on ${formatCalendarDate(item.work_date)}`}
            className="text-text-muted opacity-0 group-hover/record:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {item.me.can_edit ? (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit record
            </DropdownMenuItem>
          ) : null}
          {item.me.can_edit && item.me.can_delete ? <DropdownMenuSeparator /> : null}
          {item.me.can_delete ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
              <Trash2 /> Delete record
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this record?"
        confirmLabel="Delete record"
        pending={remove.isPending}
        onConfirm={() => {
          setConfirming(false);
          remove.mutate(item, { onError: error => toast.error(error.message) });
        }}
      >
        <p>
          <span className="font-mono text-text">{durationText}</span> on {formatCalendarDate(item.work_date)} by{' '}
          <span className="font-medium text-text">{item.author.name}</span> leaves {item.issue}&apos;s spent time. It
          cannot be restored; the history keeps a line saying it was removed.
        </p>
      </ConfirmDialog>
    </>
  );
}

function SpentTimeSkeleton() {
  return (
    <div aria-hidden className="mt-3 flex flex-col">
      <Skeleton className="mb-3 h-4 w-40" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={cn('grid grid-cols-[24px_minmax(0,1fr)_auto] gap-x-3 border-t py-3')}>
          <Skeleton className="size-6 rounded-full" />
          <div className="flex flex-col gap-2 pt-1">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}
