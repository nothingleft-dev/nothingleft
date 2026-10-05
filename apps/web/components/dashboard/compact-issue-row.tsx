'use client';

import Link from 'next/link';
import { RESOLVED_STATUS_CATEGORIES, type IssueListItem } from '@nothingleft/types';
import { Skeleton } from '@components/ui/skeleton';
import { IssueKey } from '@components/issue-key';
import { AssigneeStack } from '@components/issues/assignee-stack';
import { DueDate } from '@components/issues/due-date';
import { StatusPill } from '@components/issues/status-pill';
import { PriorityBadge, TypeBadge } from '@components/issues/value-marks';
import { issuePath } from '@lib/issue-path';
import { cn } from '@lib/utils';

interface CompactIssueRowProps {
  issue: IssueListItem;
  today: string;
}

/** DESIGN-SYSTEM § 7 Issue row: `[P][T] KEY Title … status · due · assignees`, hairline-separated. */
export function CompactIssueRow({ issue, today }: CompactIssueRowProps) {
  const resolved = RESOLVED_STATUS_CATEGORIES.includes(issue.status.category);
  return (
    <Link
      href={issuePath(issue)}
      className="grid h-row grid-cols-[auto_auto_minmax(72px,auto)_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-sm border-b border-border-subtle px-2 last:border-b-transparent hover:bg-hover max-md:grid-cols-[minmax(64px,auto)_minmax(0,1fr)_auto]"
    >
      <PriorityBadge priority={issue.priority} className={cn('max-md:hidden', resolved && 'opacity-55')} />
      <TypeBadge type={issue.type} className={cn('max-md:hidden', resolved && 'opacity-55')} />
      <IssueKey issueKey={issue.key} resolved={resolved} />
      <span className={cn('truncate', resolved && 'text-text-muted line-through decoration-border-strong')}>
        {issue.title}
      </span>
      <StatusPill status={issue.status} className="min-w-0 max-md:hidden" />
      <DueDate value={issue.due_date} today={today} resolved={resolved} className="min-w-[60px] text-right" />
      <AssigneeStack assignees={issue.assignees} withName={false} className="max-md:hidden" />
    </Link>
  );
}

export function CompactRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-row items-center gap-2 border-b border-border-subtle px-2">
          <Skeleton className="size-badge-letter rounded-xs" />
          <Skeleton className="size-badge-letter rounded-xs" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3" style={{ width: `${35 + ((i * 29) % 45)}%` }} />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
