import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  count?: ReactNode;
  action?: { label: string; href: Route } | { label: string; onClick: () => void };
  children: ReactNode;
}

/** A dashboard section: heading, muted count, one right-hand action — no card. */
export function Section({ title, count, action, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex h-control items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        {count !== undefined ? <span className="tabular text-text-muted">{count}</span> : null}
        {action ? (
          'href' in action ? (
            <Link href={action.href} className="ml-auto text-xs text-text-secondary hover:text-text hover:underline">
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="ml-auto text-xs text-text-secondary hover:text-text hover:underline"
            >
              {action.label}
            </button>
          )
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** DESIGN-SYSTEM § 7: a muted sentence inside the section it replaces, naming the action. */
export function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 py-4 text-xs leading-[18px] text-text-muted [&_a]:text-text-secondary [&_a]:underline">
      {children}
    </p>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button type="button" onClick={onRetry} className="font-medium text-text underline hover:no-underline">
      Retry
    </button>
  );
}

/** Nothing loaded: says so in place of the section, never an empty list or a zero. */
export function SectionError({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <p role="alert" className="px-2 py-4 text-xs leading-[18px] text-danger-fg">
      {children} <RetryButton onRetry={onRetry} />
    </p>
  );
}

/** A refresh failed: what loaded earlier stays, marked as possibly out of date. */
export function StaleNotice({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <p role="status" className="px-2 py-1 text-2xs text-warning-fg">
      {children} <RetryButton onRetry={onRetry} />
    </p>
  );
}
