import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { formatCalendarDate, formatCalendarDateShort } from '@lib/datetime';
import { cn } from '@lib/utils';

interface DueDateProps {
  value: string | null;
  /** `YYYY-MM-DD` in the viewer's zone. */
  today: string;
  /** A resolved issue's date is history, never overdue. */
  resolved?: boolean;
  className?: string;
}

/** Overdue in danger ink, today in primary, everything else muted; an empty cell is `--`. */
export function DueDate({ value, today, resolved = false, className }: DueDateProps) {
  if (value === null) return <span className={cn('text-xs tabular text-text-muted', className)}>--</span>;

  const overdue = !resolved && value < today;
  const isToday = value === today;
  const label = isToday ? 'Today' : formatCalendarDateShort(value);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'whitespace-nowrap text-xs tabular text-text-muted',
            overdue && 'font-medium text-danger-fg',
            isToday && !resolved && 'font-medium text-text',
            className,
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {overdue ? 'Overdue · ' : ''}
        {formatCalendarDate(value)}
      </TooltipContent>
    </Tooltip>
  );
}
