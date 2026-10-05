import type { ComponentProps } from 'react';
import type { LabelColor, StatusCategory } from '@nothingleft/types';
import { StatusDot } from '@components/issues/value-marks';
import { cn } from '@lib/utils';

interface StatusPillProps extends ComponentProps<'span'> {
  status: { name: string; category: StatusCategory; color: LabelColor };
  /** Hover reveals a hairline border: the pill opens a picker. */
  editable?: boolean;
}

/** DESIGN-SYSTEM § 7: dot + name, 13px secondary, 26px tall, min-width so columns align. */
export function StatusPill({ status, editable = false, className, ...props }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] min-w-[104px] max-w-full items-center gap-2 rounded-sm border border-transparent px-2 text-xs text-text-secondary',
        editable && 'group-hover/pill:border-border-strong group-hover/pill:text-text',
        className,
      )}
      {...props}
    >
      <StatusDot category={status.category} color={status.color} />
      <span className="truncate">{status.name}</span>
    </span>
  );
}
