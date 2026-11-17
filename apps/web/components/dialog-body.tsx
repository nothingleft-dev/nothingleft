import type { ComponentProps } from 'react';
import { cn } from '@lib/utils';

/** The part of a dialog that scrolls while its header and footer stay in view. The 4px pad keeps focus rings unclipped. */
export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-body" className={cn('-m-1 min-h-0 overflow-y-auto p-1', className)} {...props} />;
}
