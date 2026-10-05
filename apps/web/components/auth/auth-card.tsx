import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

export function AuthHeading({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {lede ? <p className="text-md leading-6 text-text-secondary">{lede}</p> : null}
    </header>
  );
}

export function FinePrint({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed text-text-secondary [&_a]:underline [&_a]:underline-offset-4">{children}</p>
  );
}

export function Swap({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-secondary">{children}</p>;
}

/** The one link style on these pages: ink, underlined on hover. Never an accent fill. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as Route} className="font-medium text-text underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
