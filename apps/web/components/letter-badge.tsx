import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { cn } from '@lib/utils';

export type PaletteToken =
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'pink'
  | 'brown'
  | 'gray';

interface LetterBadgeProps {
  letter: string;
  label: string;
  /** Omitted = neutral: the resting state carries no colour. */
  color?: PaletteToken;
  /** A label colour (`green-1`): statuses, priorities and types. Wins over `color`. */
  swatch?: string;
  variant?: 'filled' | 'outlined';
  className?: string;
}

export function LetterBadge({ letter, label, color, swatch, variant = 'filled', className }: LetterBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className={cn(
            'inline-flex size-badge-letter items-center justify-center rounded-xs text-[11px] font-semibold leading-none',
            swatch ? `l-${swatch}` : color ? `c-${color}` : 'c-neutral',
            variant === 'filled' ? 'bg-c-bg text-c-fg' : 'border border-border-strong text-text-secondary',
            className,
          )}
        >
          {letter}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
