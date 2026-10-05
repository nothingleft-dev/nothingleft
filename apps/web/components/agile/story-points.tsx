import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { cn } from '@lib/utils';

/** A neutral mono chip; nothing when unpointed, since `--` in every card would be noise. */
export function StoryPoints({ points, className }: { points: number | null; className?: string }) {
  if (points === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={`${points} story ${points === 1 ? 'point' : 'points'}`}
          className={cn(
            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border px-1 font-mono text-[11px] font-medium tabular text-text-secondary',
            className,
          )}
        >
          {points}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {points} story {points === 1 ? 'point' : 'points'}
      </TooltipContent>
    </Tooltip>
  );
}
