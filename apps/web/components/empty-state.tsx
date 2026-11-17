import type { ReactNode } from 'react';
import { cn } from '@lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-start gap-2 rounded-md border px-4 py-6', className)}>
      <p className="font-medium">{title}</p>
      {description ? <p className="text-xs text-text-secondary">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
