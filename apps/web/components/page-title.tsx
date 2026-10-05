import type { ComponentProps } from 'react';
import { cn } from '@lib/utils';

/** Page titles end in the accent period; content titles (an issue's summary) never do. */
export function PageTitle({ className, ...props }: ComponentProps<'h1'>) {
  return (
    <h1
      className={cn("text-xl font-semibold tracking-tight after:text-brand after:content-['.']", className)}
      {...props}
    />
  );
}
