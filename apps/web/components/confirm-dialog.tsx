'use client';

import type { ReactNode } from 'react';
import { Button } from '@components/ui/button';
import { PendingButton } from '@components/pending-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confirmLabel: string;
  /** The confirm verb in progress: "Deleting…", "Removing…". */
  pendingLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  destructive?: boolean;
  children: ReactNode;
}

/**
 * Only for what cannot be undone or what affects other people — DESIGN-SYSTEM § 9. A
 * reversible action gets a toast with Undo instead of a question.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  confirmLabel,
  pendingLabel,
  onConfirm,
  pending = false,
  destructive = true,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // The panel takes focus, so Cancel does not open wearing a ring beside the red button.
        onOpenAutoFocus={event => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2 text-xs leading-5 text-text-secondary">{children}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <PendingButton
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            pending={pending}
            pendingLabel={pendingLabel}
          >
            {confirmLabel}
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
