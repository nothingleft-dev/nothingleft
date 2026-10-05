'use client';

import { Inbox } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { useUnreadCount } from '@hooks/use-notifications';
import { cn } from '@lib/utils';

const BADGE_MAX = 99;

/** The header's unread count: entries with anything unread, across every organisation. */
export function InboxButton() {
  const pathname = usePathname();
  const unread = useUnreadCount();
  const count = unread.data?.count ?? 0;
  const label = count > 0 ? `Inbox, ${count} unread` : 'Inbox';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn('relative', pathname === '/inbox' && 'bg-active')}
          aria-label={label}
        >
          <Link href="/inbox">
            <Inbox className="size-icon" />
            {count > 0 ? (
              <span className="absolute top-0.5 right-0 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 font-semibold tabular text-on-brand ring-2 ring-surface">
                {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
              </span>
            ) : null}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{count > 0 ? `${count} unread in your inbox` : 'Inbox'}</TooltipContent>
    </Tooltip>
  );
}
