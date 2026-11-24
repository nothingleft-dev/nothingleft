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
          'bg-[repeating-linear-gradient(135deg,var(--c-solid)_0_1.5px,transparent_1.5px_3.5px)] shadow-[inset_0_0_0_1px_var(--c-solid)]',
        category !== 'backlog' && category !== 'cancelled' && 'bg-c-solid',
        className,
      )}
    />
  );
}

/** A priority's or a type's dot, beside its name; `plain` keeps it grey where the value is nothing to flag. */
export function ValueDot({
  color,
  plain = false,
  className,
}: {
  color: LabelColor;
  plain?: boolean;
  className?: string;
}) {
  return (
    <i
      aria-hidden
      className={cn(
        'inline-block size-2 flex-none rounded-full',
        plain ? 'bg-border-strong' : `l-${color} bg-c-solid`,
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
