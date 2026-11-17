import type { ReactNode } from 'react';
import Link from 'next/link';
import { CircleAlert, CloudOff, SearchX, Timer, type LucideIcon } from 'lucide-react';
import { BrandMark } from '@components/shell/brand';
import { cn } from '@lib/utils';

export type FullPageKind = '404' | 'Error' | 'Connection' | 'Request limit';

// Colour only where something is wrong: a missing page is neutral, a failure red, a pause amber.
const EYEBROWS: Record<FullPageKind, { icon: LucideIcon; tone: string }> = {
  '404': { icon: SearchX, tone: 'text-text-muted' },
  Error: { icon: CircleAlert, tone: 'text-danger-fg' },
  Connection: { icon: CloudOff, tone: 'text-danger-fg' },
  'Request limit': { icon: Timer, tone: 'text-warning-fg' },
};

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
  eyebrow: FullPageKind;
  title: ReactNode;
  children: ReactNode;
  actions: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const { icon: Icon, tone } = EYEBROWS[eyebrow];
  return (
    <div className={cn('flex w-full max-w-[440px] flex-col items-start', className)}>
      <p className={cn('flex items-center gap-1.5 text-xs', tone)}>
        <Icon aria-hidden className="size-icon-sm flex-none" />
        {eyebrow}
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-balance after:text-brand after:content-['.']">
        {title}
      </h1>
      <div className="mt-2 text-text-secondary text-pretty">{children}</div>
      <div className="mt-6 flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">{actions}</div>
      {footer ? <div className="mt-6 text-2xs text-text-muted">{footer}</div> : null}
    </div>
  );
}

/**
 * Outside the shell: the mark top-left leads home, and the block starts at a fixed height so its
 * eyebrow and title sit in the same place whichever state is showing.
 */
export function CentredState({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-dvh bg-surface px-page-x-mobile">
      <Link
        href="/"
        aria-label="Home"
        className="absolute top-[18px] left-[18px] rounded-sm p-1.5 transition-colors hover:bg-hover max-md:top-2.5 max-md:left-2.5"
      >
        <BrandMark size={20} />
      </Link>
      <div className="flex justify-center pt-[max(6rem,30vh)] pb-12">{children}</div>
    </main>
  );
}

export const SECONDARY_LINK = 'action-link rounded-xs font-medium text-text-secondary hover:text-text';
