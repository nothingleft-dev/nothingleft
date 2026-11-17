'use client';

import type { ComponentProps } from 'react';
import { cn } from '@lib/utils';
import { PopoverContent as PopoverContentBase } from '@components/ui/popover';

export { Popover, PopoverAnchor, PopoverTrigger } from '@components/ui/popover';

export function PopoverContent({
  className,
  collisionPadding = 8,
  ...props
}: ComponentProps<typeof PopoverContentBase>) {
  return (
    <PopoverContentBase
      collisionPadding={collisionPadding}
      className={cn('max-h-(--radix-popover-content-available-height) overflow-y-auto', className)}
      {...props}
    />
  );
}
