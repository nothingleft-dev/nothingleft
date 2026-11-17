'use client';

import { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { formatDateTimeWithZone, formatRelative, type Instant } from '@lib/datetime';
import { cn } from '@lib/utils';

interface RelativeTimeProps {
  value: Instant;
  timeZone?: string;
  className?: string;
}

export function RelativeTime({ value, timeZone, className }: RelativeTimeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const at = value instanceof Date ? value : new Date(value);
  const iso = at.toISOString();
  // Everything shown here already happened; a server clock ahead of the viewer's must not read as the future.
  const shown = Math.min(at.getTime(), now);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} className={cn('text-text-muted', className)}>
          {formatRelative(shown, now, timeZone)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatDateTimeWithZone(value, timeZone)}</TooltipContent>
    </Tooltip>
  );
}
