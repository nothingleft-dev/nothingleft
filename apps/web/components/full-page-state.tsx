import type { ReactNode } from 'react';
import { cn } from '@lib/utils';

/**
 * One template for every page-sized state (404, error, server unreachable, rate limit): a fixed column,
 * so the left edge never moves between states, and an action row that holds its height.
 */
export function FullPageState({
  eyebrow,
  title,
  children,
  actions,
  footer,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  children: ReactNode;
  actions: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex w-full max-w-[440px] flex-col items-start', className)}>
      <p className="flex items-center gap-1.5 text-xs text-text-muted">{eyebrow}</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-balance">{title}</h1>
      <div className="mt-2 text-text-secondary text-pretty">{children}</div>
      <div className="mt-6 flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">{actions}</div>
      {footer ? <div className="mt-6 text-2xs text-text-muted">{footer}</div> : null}
    </div>
  );
}

/** Outside the shell the state centres in the viewport, on the same surface the app's pages use. */
export function CentredState({ children }: { children: ReactNode }) {
  return <main className="grid min-h-dvh place-items-center bg-surface px-page-x-mobile py-12">{children}</main>;
}

export const SECONDARY_LINK = 'action-link rounded-xs font-medium text-text-secondary hover:text-text';
