'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Skeleton } from '@components/ui/skeleton';
import { Section, SectionEmpty } from '@components/dashboard/section';
import { IssueKey } from '@components/issue-key';
import { QueryState } from '@components/query-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { entryId, useInboxPreview, useMarkRead, useUnreadCount } from '@hooks/use-notifications';
import { useOpenNotification } from '@hooks/use-open-notification';
import { formatDateTimeWithZone, formatRelativeShort } from '@lib/datetime';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';

/** The My work rail's Inbox: the newest few entries, each opening its subject. */
export function InboxPreview() {
  const preview = useInboxPreview();
  const unread = useUnreadCount();
  const mark = useMarkRead();
  const openLink = useOpenNotification();
  const unreadCount = unread.data?.count ?? 0;
  const markAllRead = () =>
    mark.mutate(
      { how: 'all', filter: {} },
      { onError: error => toastError('Could not mark everything read', error, { retry: markAllRead }) },
    );

  return (
    <Section
      title="Inbox"
      count={unread.data && unreadCount > 0 ? `${unreadCount} unread` : undefined}
      action={[
        ...(unreadCount > 0 ? [{ label: 'Mark all read', onClick: markAllRead }] : []),
        { label: 'Open inbox', href: '/inbox' as Route },
      ]}
    >
      <QueryState
        query={preview}
        pending={
          <div className="flex flex-col gap-3 px-3 py-2" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
                <Skeleton className="h-2.5 w-2/3" />
              </div>
            ))}
          </div>
        }
        error="Your inbox could not be loaded."
        isEmpty={entries => entries.length === 0}
        empty={
          <SectionEmpty className="px-3">Nothing in your inbox. Assignments and mentions arrive here.</SectionEmpty>
        }
      >
        {entries => (
          <ul className="flex flex-col">
            {entries.map(group => {
              const unreadHere = group.unread_count > 0;
              const org = group.subject.organization.slug;
              return (
                <li key={entryId(group)} className="border-b border-border-subtle last:border-b-0">
                  <Link
                    href={group.path as Route}
                    onClick={event =>
                      openLink(
                        event,
                        org,
                        group.path,
                        unreadHere ? () => mark.mutate({ how: 'entry', group }) : undefined,
                      )
                    }
                    className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-x-2 rounded-sm px-3 py-1.5 hover:bg-hover"
                  >
                    <span className={cn('mt-1.5 size-2 rounded-full', unreadHere ? 'bg-brand' : 'bg-transparent')} />
                    <span className="flex min-w-0 items-center gap-1.5 text-xs">
                      {group.subject.type === 'issue' ? (
                        <IssueKey issueKey={group.subject.key} className="flex-none" />
                      ) : null}
                      <span className={cn('truncate', unreadHere ? 'font-medium text-text' : 'text-text-secondary')}>
                        {group.subject.type === 'sprint' ? group.subject.name : group.subject.title}
                      </span>
                    </span>
                    <ShortTime value={group.latest_at} />
                    <span className="col-start-2 col-end-4 truncate text-2xs text-text-secondary">
                      {group.notifications[0]?.summary}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </Section>
  );
}

/** `19m`, `3h`, `2d`, `19 Sep`, with the full instant on hover: the rail has no room for `19 minutes ago`. */
function ShortTime({ value }: { value: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const at = new Date(value);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={at.toISOString()} className="text-2xs leading-5 text-text-muted tabular">
          {formatRelativeShort(at, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatDateTimeWithZone(at)}</TooltipContent>
    </Tooltip>
  );
}
