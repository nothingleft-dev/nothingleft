import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { cn } from '@lib/utils';

type SectionAction = { label: string; href: Route } | { label: string; onClick: () => void };

interface SectionProps {
  title: string;
  count?: ReactNode;
  action?: SectionAction | readonly SectionAction[];
  children: ReactNode;
}

const ACTION = 'text-xs text-text-secondary hover:text-text hover:underline';

/** A dashboard section: heading, muted count, right-hand actions — no card. */
export function Section({ title, count, action, children }: SectionProps) {
  const actions = action ? (Array.isArray(action) ? action : [action as SectionAction]) : [];
  return (
    <section className="flex flex-col gap-1">
      <div className="flex h-control items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        {count !== undefined ? <span className="tabular text-text-muted">{count}</span> : null}
        {actions.length > 0 ? (
          <span className="ml-auto flex items-center gap-4">
            {actions.map(a =>
              'href' in a ? (
                <Link key={a.label} href={a.href} className={ACTION}>
                  {a.label}
                </Link>
              ) : (
                <button key={a.label} type="button" onClick={a.onClick} className={ACTION}>
                  {a.label}
                </button>
              ),
            )}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** DESIGN-SYSTEM § 7: a muted sentence inside the section it replaces, naming the action. */
export function SectionEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'px-2 py-4 text-xs leading-[18px] text-text-muted [&_a]:action-link [&_a]:text-text-secondary',
        className,
      )}
    >
      {children}
    </p>
  );
}
