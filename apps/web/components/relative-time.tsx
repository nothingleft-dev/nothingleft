'use client';

import { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
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

  const iso = value instanceof Date ? value.toISOString() : new Date(value).toISOString();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} className={cn('text-text-muted', className)}>
          {formatRelative(value, now, timeZone)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatDateTimeWithZone(value, timeZone)}</TooltipContent>
    </Tooltip>
  );
}
