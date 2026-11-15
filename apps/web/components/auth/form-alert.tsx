'use client';

import { AlertCircle, CheckCircle2, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@lib/utils';

/**
 * The inline alert from design/DESIGN-SYSTEM.md § 9: palette tint, tinted border, and
 * the body in the same `-fg` token as the title. `-fg` is the one colour guaranteed
 * ≥ 7:1 on its own `-bg` in both themes — neutral secondary ink on a tinted fill is
 * what made this unreadable in dark mode.
 */
export function FormAlert({
  tone = 'danger',
  title,
  children,
  action,
  className,
}: {
  tone?: 'danger' | 'warning' | 'success';
  title: ReactNode;
  children?: ReactNode;
  /** A real button on the right, e.g. `<RetryButton>`. */
  action?: ReactNode;
  className?: string;
}) {
  const danger = tone === 'danger';
  const Icon = danger ? AlertCircle : tone === 'warning' ? TriangleAlert : CheckCircle2;

  return (
    <div
      role={danger ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2.5',
        // Half the palette tint over the surface: the full tint read as a slab in dark mode; the -fg ink keeps its contrast.
        danger && 'border-danger-fg/25 bg-[color-mix(in_oklab,var(--danger-bg)_50%,var(--bg-surface))] text-danger-fg',
        tone === 'warning' &&
          'border-warning-fg/25 bg-[color-mix(in_oklab,var(--warning-bg)_50%,var(--bg-surface))] text-warning-fg',
        tone === 'success' && 'border-success-fg/25 bg-success-fg/10 text-success-fg',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-56 gap-2.5">
        <Icon className="mt-px size-icon-sm flex-none" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium">{title}</p>
          {children ? (
            <div className="text-xs opacity-90 [&_:is(a,button):not([data-slot])]:font-medium [&_:is(a,button):not([data-slot])]:underline [&_:is(a,button):not([data-slot])]:underline-offset-2 [&_:is(a,button):not([data-slot]):hover]:no-underline">
              {children}
            </div>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex flex-none items-center gap-2">{action}</div> : null}
    </div>
  );
}
