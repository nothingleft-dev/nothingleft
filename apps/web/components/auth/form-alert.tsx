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
}: {
  tone?: 'danger' | 'warning' | 'success';
  title: string;
  children?: ReactNode;
}) {
  const danger = tone === 'danger';
  const Icon = danger ? AlertCircle : tone === 'warning' ? TriangleAlert : CheckCircle2;

  return (
    <div
      role={danger ? 'alert' : 'status'}
      className={cn(
        'flex gap-2.5 rounded-md border px-3 py-2.5',
        danger && 'border-danger-fg/25 bg-danger-bg text-danger-fg',
        tone === 'warning' && 'border-warning-fg/25 bg-warning-bg text-warning-fg',
        tone === 'success' && 'border-success-fg/25 bg-success-fg/10 text-success-fg',
      )}
    >
      <Icon className="mt-px size-icon-sm flex-none" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{title}</p>
        {children ? (
          <div className="text-xs opacity-90 [&_a]:font-medium [&_a]:underline [&_button]:font-medium [&_button]:underline [&_button]:underline-offset-2 [&_button:hover]:no-underline">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
