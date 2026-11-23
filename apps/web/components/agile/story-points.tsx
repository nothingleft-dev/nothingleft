import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { cn } from '@lib/utils';

const CHIP =
  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border px-1 font-mono text-[11px] font-medium tabular';

/**
 * A neutral mono chip. Unpointed is nothing on a card, where `?` on every card would be noise, and
 * `unestimated="mark"` in a column of rows, where a hole reads as a missing value.
 */
export function StoryPoints({
  points,
  unestimated = 'none',
  unit = false,
  className,
}: {
  points: number | null;
  unestimated?: 'none' | 'mark';
  /** Says `pts` after the figure where no heading names the column. */
  unit?: boolean;
  className?: string;
}) {
  if (points === null && unestimated === 'none') return null;
  const label = points === null ? 'Not estimated' : `${points} story ${points === 1 ? 'point' : 'points'}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className={cn(CHIP, 'text-text-secondary', points === null && 'border-dashed', className)}
        >
          {points ?? '?'}
          {unit && points !== null ? (
            <span className="ml-1 font-sans font-normal">{points === 1 ? 'pt' : 'pts'}</span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
