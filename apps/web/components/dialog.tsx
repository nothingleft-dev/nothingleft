'use client';

import type { ComponentProps } from 'react';
import { DialogContent as PrimitiveContent } from '@components/ui/dialog';

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from '@components/ui/dialog';

const TEXT_FIELD =
  'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]), textarea, [contenteditable="true"]';

/**
 * Opens on its first text field, or else on the panel itself: focusing the first button would dress Cancel in the
 * keyboard focus ring for someone who opened the dialog with the mouse.
 */
export function DialogContent({ onOpenAutoFocus, ...props }: ComponentProps<typeof PrimitiveContent>) {
  return (
    <PrimitiveContent
      onOpenAutoFocus={
        onOpenAutoFocus ??
        (event => {
          event.preventDefault();
          const panel = event.currentTarget;
          if (!(panel instanceof HTMLElement)) return;
          const field = panel.querySelector<HTMLElement>(TEXT_FIELD);
          (field ?? panel).focus();
        })
      }
      {...props}
    />
  );
}
