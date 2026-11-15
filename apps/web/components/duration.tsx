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
    // A mono space is a full cell wide, so `1d 2h` read as two gaps; a tighter word space keeps it one value.
    <span className={cn('font-mono tabular [word-spacing:-0.3em]', className)}>
      {minutes === 0 ? '0m' : formatDuration(minutes, calendar)}
    </span>
  );
}
