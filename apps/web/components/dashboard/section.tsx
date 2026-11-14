import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';

type SectionAction = { label: string; href: Route } | { label: string; onClick: () => void };

interface SectionProps {
  title: string;
  count?: ReactNode;
  action?: SectionAction | readonly SectionAction[];
  /** A refresh failed and the page says so once; the section only carries a mark. */
  stale?: boolean;
  children: ReactNode;
}

const ACTION = 'text-xs text-text-secondary hover:text-text hover:underline';

/** A dashboard section: heading, muted count, right-hand actions — no card. */
export function Section({ title, count, action, stale = false, children }: SectionProps) {
  const actions = action ? (Array.isArray(action) ? action : [action as SectionAction]) : [];
  return (
    <section className="flex flex-col gap-1">
      <div className="flex h-control items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        {count !== undefined ? <span className="tabular text-text-muted">{count}</span> : null}
        {stale ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex rounded-xs text-warning-fg">
                <TriangleAlert aria-label="Could not be refreshed" className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Could not be refreshed and may be out of date</TooltipContent>
          </Tooltip>
        ) : null}
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
export function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 py-4 text-xs leading-[18px] text-text-muted [&_a]:action-link [&_a]:text-text-secondary">
      {children}
    </p>
  );
}
