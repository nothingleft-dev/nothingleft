'use client';

import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@components/ui/button';

interface StepPanelProps {
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function StepPanel({ eyebrow, title, lede, children, footer }: StepPanelProps) {
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

      {footer ? <div className="flex flex-wrap items-center gap-3 border-t pt-6">{footer}</div> : null}
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
