import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@components/ui/button';
import { cn } from '@lib/utils';

const LAYER = 'col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5';

/** Both labels share one grid cell, so the button keeps the wider one's width as it switches. */
export function PendingLabel({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="grid">
      <span className={cn(LAYER, pending && 'invisible')}>{children}</span>
      <span className={cn(LAYER, !pending && 'invisible')} aria-hidden={!pending}>
        {pendingLabel}
      </span>
    </span>
  );
}

/**
 * A button whose action is running: it refuses clicks but keeps its own fill (globals.css
 * `[data-pending]`), so "working" never reads as "unavailable".
 */
export function PendingButton({
  pending,
  pendingLabel,
  disabled,
  children,
  after,
  ...props
}: ComponentProps<typeof Button> & {
  pending: boolean;
  pendingLabel: ReactNode;
  /** Shown in both states, outside the swap: a shortcut hint. */
  after?: ReactNode;
}) {
  return (
    <Button
      {...props}
      disabled={pending || disabled}
      data-pending={pending ? '' : undefined}
      aria-busy={pending || undefined}
    >
      <PendingLabel pending={pending} pendingLabel={pendingLabel}>
        {children}
      </PendingLabel>
      {after}
    </Button>
  );
}
