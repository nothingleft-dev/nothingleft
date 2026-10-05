'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { toast } from 'sonner';
import { Skeleton } from '@components/ui/skeleton';
import { Section, SectionEmpty } from '@components/dashboard/section';
import { IssueKey } from '@components/issue-key';
import { RelativeTime } from '@components/relative-time';
import { entryId, useInboxPreview, useMarkRead, useUnreadCount } from '@hooks/use-notifications';
import { useOpenNotification } from '@hooks/use-open-notification';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';

/** The My work rail's Inbox: the newest few entries, each opening its subject. */
export function InboxPreview() {
  const preview = useInboxPreview();
  const unread = useUnreadCount();
  const mark = useMarkRead();
  const openLink = useOpenNotification();
  const entries = preview.data ?? [];
  const unreadCount = unread.data?.count ?? 0;

  return (
    <Section
      title="Inbox"
      count={unread.data && unreadCount > 0 ? `${unreadCount} unread` : undefined}
      action={
        unreadCount > 0
          ? {
              label: 'Mark all read',
              onClick: () =>
                mark.mutate(
                  { how: 'all', filter: {} },
                  { onError: error => toast.error(isApiError(error) ? error.message : 'Nothing was marked read.') },
                ),
            }
          : { label: 'Open inbox', href: '/inbox' as Route }
      }
    >
      {preview.isPending ? (
        <div className="flex flex-col gap-3 px-2 py-2" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
              <Skeleton className="h-2.5 w-2/3" />
            </div>
          ))}
        </div>
      ) : preview.isError ? (
        <SectionEmpty>Your inbox could not be loaded.</SectionEmpty>
      ) : entries.length === 0 ? (
        <SectionEmpty>
          Nothing in your inbox. You hear here when someone assigns you an issue or mentions you.
        </SectionEmpty>
      ) : (
        <ul className="flex flex-col">
          {entries.map(group => {
            const unreadHere = group.unread_count > 0;
            const org = group.subject.organization.slug;
            return (
              <li key={entryId(group)} className="border-b border-border-subtle">
                <Link
                  href={group.path as Route}
                  onClick={event => {
                    if (unreadHere) mark.mutate({ how: 'entry', group });
                    openLink(event, org, group.path);
                  }}
                  className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-x-2 rounded-sm px-2 py-1.5 hover:bg-hover"
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
                  <RelativeTime value={group.latest_at} className="text-2xs leading-5" />
                  <span className="col-start-2 col-end-4 truncate text-2xs text-text-secondary">
                    {group.notifications[0]?.summary}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href={'/inbox' as Route}
              className="block px-2 py-1.5 text-xs text-text-secondary hover:text-text hover:underline"
            >
              Open inbox
            </Link>
          </li>
        </ul>
      )}
    </Section>
  );
}
