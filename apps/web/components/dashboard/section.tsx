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
