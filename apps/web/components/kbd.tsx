import type { ComponentProps } from 'react';
import { cn } from '@lib/utils';

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-b-2 bg-inset px-1 font-sans text-[11px] font-medium text-text-muted',
        className,
      )}
      {...props}
    />
  );
}
