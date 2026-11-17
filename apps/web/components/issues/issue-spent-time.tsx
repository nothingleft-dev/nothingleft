'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { MoreHorizontal, Pencil, Timer, Trash2 } from 'lucide-react';
import { formatDuration } from '@nothingleft/format';
import type { Issue, MemberRef, WorkItem } from '@nothingleft/types';
import { LoadError } from '@components/query-state';
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
import { toastError } from '@components/toast-error';
import { plural } from '@lib/numbers';
import { LoadMore } from '@components/text-button';

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
  const slots = badgeSlots(rows);
  const over =
    issue.estimate_minutes !== null && issue.spent_minutes > issue.estimate_minutes
      ? issue.spent_minutes - issue.estimate_minutes
      : 0;

  if (records.isPending) return <SpentTimeSkeleton />;
  if (records.isError) {
    return (
      <div className="mt-3">
        <LoadError onRetry={() => void records.refetch()} detail={records.error.message}>
          The spent time could not be loaded.
        </LoadError>
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-xs text-text-secondary">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 sm:gap-x-2">
        <span>
          Total <Duration minutes={issue.spent_minutes} calendar={calendar} className="text-sm font-medium text-text" />
          {issue.estimate_minutes !== null ? (
            <>
              {' '}
              of <Duration minutes={issue.estimate_minutes} calendar={calendar} className="text-text" /> estimated
            </>
          ) : null}
        </span>
        {over > 0 ? (
          <>
            <Dot />
            <span className="text-danger-fg">
              <Duration minutes={over} calendar={calendar} /> over
            </span>
          </>
        ) : null}
        <Dot />
        <span>{plural(total, 'record')}</span>
      </p>
      {canLog ? (
        <Button size="sm" variant="outline" className="sm:ml-auto" onClick={onLogTime}>
          <Timer /> Add spent time
        </Button>
      ) : null}
    </div>
  );
  const legend = slots.map(slot => (slot === TYPE_SLOT ? 'Type' : slot)).join(' · ');

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
              <Timer /> Add spent time
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <>
      {header}
      {legend ? (
        <p aria-hidden className="pb-1.5 text-2xs text-text-muted max-sm:pl-9 sm:pr-[7.5rem] sm:text-right">
          {legend}
        </p>
      ) : null}
      <ol className="divide-y divide-border-subtle border-y">
        {rows.map(row => (
          <SpentTimeRow
            key={row.id}
            item={row}
            ownIssue={row.issue === issue.key}
            slots={slots}
            durationText={formatDuration(row.duration_minutes, calendar)}
            duration={<Duration minutes={row.duration_minutes} calendar={calendar} />}
            onEdit={() => setEditing(row)}
          />
        ))}
      </ol>
      {records.hasNextPage ? (
        <LoadMore
          className="mt-2 pl-9"
          pending={records.isFetchingNextPage}
          pendingLabel="Loading more…"
          onClick={() => void records.fetchNextPage()}
        >
          Show later records
        </LoadMore>
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

const TYPE_SLOT = '';

// A wrapped line on a phone would start or end on the dot; the wider gap separates there.
function Dot() {
  return (
    <span aria-hidden className="text-text-muted max-sm:hidden">
      ·
    </span>
  );
}

function EmptySlot() {
  return (
    <span aria-hidden className="grid size-badge-letter flex-none place-items-center">
      <i className="h-px w-1.5 bg-border-strong" />
    </span>
  );
}

/** One column per attribute any row carries, so each attribute's letter sits at the same x on every row. */
function badgeSlots(rows: WorkItem[]): string[] {
  const names = new Set<string>();
  for (const row of rows) for (const a of row.attributes) names.add(a.attribute);
  return [...(rows.some(r => r.work_type) ? [TYPE_SLOT] : []), ...names];
}

interface SpentTimeRowProps {
  item: WorkItem;
  ownIssue: boolean;
  slots: string[];
  durationText: string;
  duration: ReactNode;
  onEdit: () => void;
}

function SpentTimeRow({ item, ownIssue, slots, durationText, duration, onEdit }: SpentTimeRowProps) {
  const onBehalf = item.created_by.username !== item.author.username;
  return (
    <li className="group/record grid grid-cols-[24px_minmax(0,1fr)_auto] gap-x-3 py-2.5 max-sm:grid-cols-[24px_minmax(0,1fr)]">
      <MemberAvatar member={item.author} className="mt-0.5 size-6 sm:row-span-2" />
      <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-secondary">
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
      <div className="flex h-6 items-center gap-2 max-sm:col-start-2 max-sm:mt-1 sm:row-span-2">
        {slots.map(slot => {
          if (slot === TYPE_SLOT) {
            return item.work_type ? (
              <LetterBadge
                key="type"
                letter={item.work_type.short_label}
                label={`Type: ${item.work_type.name}`}
                variant="outlined"
              />
            ) : (
              <EmptySlot key="type" />
            );
          }
          const value = item.attributes.find(a => a.attribute === slot)?.value;
          return value ? (
            <LetterBadge key={slot} letter={value.short_label} label={`${slot}: ${value.name}`} variant="outlined" />
          ) : (
            <EmptySlot key={slot} />
          );
        })}
        <span className="text-right text-xs font-medium whitespace-nowrap max-sm:ml-auto sm:w-20">{duration}</span>
        <RecordMenu item={item} durationText={durationText} onEdit={onEdit} />
      </div>
      {item.description_md.trim() ? (
        <Markdown
          source={item.description_md}
          variant="comment"
          className="col-start-2 mt-0.5 max-w-none sm:row-start-2"
        />
      ) : null}
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
            className="text-text-muted reveal group-hover/record:opacity-100"
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
        pendingLabel="Deleting…"
        pending={remove.isPending}
        onConfirm={() => {
          setConfirming(false);
          remove.mutate(item, { onError: error => toastError('Could not delete the record', error) });
        }}
      >
        <p>
          Remove <span className="font-medium text-text">{item.author.name}</span>&apos;s{' '}
          <span className="font-mono text-text">{durationText}</span> on {formatCalendarDate(item.work_date)} from{' '}
          {item.issue}? It cannot be restored; the history keeps a line saying it was removed.
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
