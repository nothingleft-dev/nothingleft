import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { cn } from '@lib/utils';

export function AuthHeading({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
      {lede ? <p className="text-md leading-6 text-text-secondary">{lede}</p> : null}
    </header>
  );
}

export function FinePrint({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-text-secondary">{children}</p>;
}

export function Swap({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-secondary">{children}</p>;
}

export const INLINE_LINK =
  'font-medium text-text underline decoration-border-strong decoration-1 underline-offset-[3px] transition-colors hover:decoration-text';

/** The one link style on these pages: ink, with an underline that draws in from the left on hover. */
export function TextLink({
  href,
  quiet,
  arrow = true,
  className,
  children,
}: {
  href: string;
  quiet?: boolean;
  arrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href as Route} className={cn(quiet ? 'auth-link-quiet' : arrow ? 'auth-link' : INLINE_LINK, className)}>
      {children}
      {quiet || !arrow ? null : (
        <span className="auth-arr" aria-hidden="true">
          {'\u2060'}→
        </span>
      )}
    </Link>
  );
}

/** A link inside a tinted alert: it takes the alert's ink. */
export function AlertLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as Route} data-slot="alert-link" className="action-link font-medium">
      {children}
    </Link>
  );
}

export function ExternalLink({ href, quiet, children }: { href: string; quiet?: boolean; children: ReactNode }) {
  return (
    <a className={quiet ? 'auth-link-quiet' : 'auth-link'} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="auth-arr auth-arr-ext" aria-hidden="true">
        {'\u2060'}↗
      </span>
    </a>
  );
}
