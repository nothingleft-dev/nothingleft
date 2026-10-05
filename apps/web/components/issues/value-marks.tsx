import type { LabelColor, StatusCategory } from '@nothingleft/types';
import { LetterBadge } from '@components/letter-badge';
import { cn } from '@lib/utils';

interface StatusDotProps {
  category: StatusCategory;
  color: LabelColor;
  className?: string;
}

// Texture, not only colour, separates backlog, unstarted and cancelled — DESIGN-SYSTEM § 3.4.
export function StatusDot({ category, color, className }: StatusDotProps) {
  return (
    <i
      aria-hidden
      className={cn(
        `l-${color} inline-block size-2 flex-none rounded-full`,
        category === 'backlog' && 'shadow-[inset_0_0_0_1.5px_var(--c-solid)]',
        category === 'cancelled' &&
          'bg-[repeating-linear-gradient(135deg,var(--c-solid)_0_1.5px,transparent_1.5px_3.5px)]',
        category !== 'backlog' && category !== 'cancelled' && 'bg-c-solid',
        className,
      )}
    />
  );
}

interface ValueMark {
  name: string;
  color: LabelColor;
  short_label: string;
}

export function PriorityBadge({ priority, className }: { priority: ValueMark; className?: string }) {
  return (
    <LetterBadge
      letter={priority.short_label}
      label={`Priority: ${priority.name}`}
      swatch={priority.color}
      className={className}
    />
  );
}

export function TypeBadge({ type, className }: { type: ValueMark; className?: string }) {
  return (
    <LetterBadge letter={type.short_label} label={`Type: ${type.name}`} swatch={type.color} className={className} />
  );
}
