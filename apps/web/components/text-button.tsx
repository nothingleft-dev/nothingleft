import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@lib/utils';
import { Button } from '@components/ui/button';

/** An action that sits inside a sentence: reads as a link, behaves as a button. */
export function TextButton({ className, type = 'button', ...props }: ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={cn('action-link rounded-xs font-medium text-text-secondary hover:text-text', className)}
      {...props}
    />
  );
}

interface LoadMoreProps {
  onClick: () => void;
  pending?: boolean;
  children?: ReactNode;
  pendingLabel?: string;
  /** What is shown so far, e.g. "100 of 160". */
  progress?: ReactNode;
  size?: 'xs' | 'sm';
  className?: string;
}

/** Every "Load more", "Show more" and "Show all N": one outlined button whose width holds while it loads. */
export function LoadMore({
  onClick,
  pending = false,
  children = 'Load more',
  pendingLabel = 'Loading…',
  progress,
  size = 'sm',
  className,
}: LoadMoreProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Button variant="outline" size={size} disabled={pending} aria-busy={pending} onClick={onClick}>
        <span className="grid">
          <span className={cn('col-start-1 row-start-1', pending && 'invisible')}>{children}</span>
          <span className={cn('col-start-1 row-start-1', !pending && 'invisible')}>{pendingLabel}</span>
        </span>
      </Button>
      {progress ? <span className="text-xs text-text-secondary tabular">{progress}</span> : null}
    </div>
  );
}
