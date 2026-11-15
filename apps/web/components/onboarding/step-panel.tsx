'use client';

import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@components/ui/button';
import { cn } from '@lib/utils';

interface StepPanelProps {
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Keeps the footer in view on a step taller than the screen; only for a footer that holds the step's action. */
  stickyFooter?: boolean;
}

export function StepPanel({ eyebrow, title, lede, children, footer, stickyFooter }: StepPanelProps) {
  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2.5">
        {/* Sentence case, no tracking: DESIGN-SYSTEM § 4 has no letterspaced eyebrows.
            Hidden below lg, where the collapsed rail already says which step this is. */}
        <p className="text-sm font-medium text-text-secondary max-lg:hidden">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
        <p className="text-md leading-6 text-text-secondary">{lede}</p>
      </header>

      {children}

      {footer ? (
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 border-t pt-6',
            stickyFooter &&
              'sticky bottom-0 z-10 -mb-4 bg-surface pt-5 pb-4 max-lg:-mb-6 max-lg:pb-6 ' +
                'before:pointer-events-none before:absolute before:inset-x-0 before:bottom-[calc(100%+1px)] before:h-8 before:bg-linear-to-b before:from-transparent before:to-surface',
          )}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" onClick={onClick} disabled={disabled}>
      <ArrowLeft className="size-icon-sm" /> Back
    </Button>
  );
}

export function SkipButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 text-sm font-medium text-text-secondary underline-offset-4 hover:text-text hover:underline disabled:opacity-60"
    >
      {children}
    </button>
  );
}
