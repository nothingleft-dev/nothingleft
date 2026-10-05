import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import { cn } from '@lib/utils';

/** A duration in `1w 1d 1h 1m`, always in the mono face — design § 4. */
export function Duration({
  minutes,
  calendar,
  className,
}: {
  minutes: number;
  calendar: WorkCalendar;
  className?: string;
}) {
  return (
    <span className={cn('font-mono tabular', className)}>
      {minutes === 0 ? '0m' : formatDuration(minutes, calendar)}
    </span>
  );
}
