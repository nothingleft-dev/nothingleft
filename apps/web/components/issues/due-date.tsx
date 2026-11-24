import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { formatCalendarDate, formatCalendarDateShort } from '@lib/datetime';
import { cn } from '@lib/utils';

interface DueDateProps {
  value: string | null;
  /** `YYYY-MM-DD` in the viewer's zone. */
  today: string;
  /** A resolved issue's date is history, never overdue. */
  resolved?: boolean;
  /** Says what the date is (`Due 4 Dec`, `Overdue · 22 Nov`), where no column heading does. */
  worded?: boolean;
  className?: string;
}

/** Overdue in danger ink, today in primary, everything else muted; an empty cell is `--`. */
export function DueDate({ value, today, resolved = false, worded = false, className }: DueDateProps) {
  // Not tabular: tabular figures give each hyphen a digit's width, and `--` falls apart.
  if (value === null) return <span className={cn('text-xs text-text-muted', className)}>--</span>;

  const overdue = !resolved && value < today;
  const isToday = value === today;
  const date = formatCalendarDateShort(value);
  const label = worded
    ? isToday
      ? 'Due today'
      : overdue
        ? `Overdue · ${date}`
        : `Due ${date}`
    : isToday
      ? 'Today'
      : date;

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
