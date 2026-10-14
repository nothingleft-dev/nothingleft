import type { Sprint } from '@nothingleft/types';
import { cn } from '@lib/utils';
import { formatCalendarDate, formatCalendarRange } from '@lib/datetime';

type Dated = Pick<Sprint, 'start_date' | 'end_date'>;

export function sprintDatesLabel({ start_date, end_date }: Dated): string {
  if (start_date && end_date) return formatCalendarRange(start_date, end_date);
  if (start_date) return `From ${formatCalendarDate(start_date)}`;
  if (end_date) return `Until ${formatCalendarDate(end_date)}`;
  return 'Unscheduled';
}

export function SprintDates({ sprint, className }: { sprint: Dated; className?: string }) {
  const unscheduled = !sprint.start_date && !sprint.end_date;
  return (
    <span className={cn('tabular', unscheduled ? 'text-text-muted' : 'text-text-secondary', className)}>
      {sprintDatesLabel(sprint)}
    </span>
  );
}

const dayCount = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

export const daysLeftLabel = (days: number) =>
  days < 0 ? `Ended ${dayCount(-days)} ago` : days === 0 ? 'Ends today' : `${dayCount(days)} left`;

// Red from under three days: the last stretch of a sprint is when scope gets cut.
const URGENT_UNDER = 3;

export function DaysLeft({ days, className }: { days: number | null; className?: string }) {
  if (days === null) return null;
  return (
    <span
      className={cn(
        'text-xs font-medium tabular whitespace-nowrap',
        days < URGENT_UNDER ? 'text-danger-fg' : 'text-text-secondary',
        className,
      )}
    >
      {daysLeftLabel(days)}
    </span>
  );
}
