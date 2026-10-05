import { CloudOff } from 'lucide-react';
import type { ByoStatus } from '@nothingleft/types';
import { cn } from '@lib/utils';

/** Why a file in the organisation's own bucket cannot open: its key is failing, or the bucket was disconnected. */
export function unavailableReason(byo: ByoStatus | null | undefined) {
  return byo === 'failed'
    ? 'Its storage bucket is refusing its key, so it can’t be opened until an admin updates the key.'
    : 'It is in a storage bucket that is no longer connected. Connecting that bucket again brings it back.';
}

export function unavailableLabel(byo: ByoStatus | null | undefined) {
  return byo === 'failed' ? 'Bucket refusing its key' : 'Bucket disconnected';
}

/** Drawn where an image would be, so a file that cannot open is never a broken image. */
export function UnavailableImage({ byo, className }: { byo: ByoStatus | null | undefined; className?: string }) {
  return (
    <span
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 bg-inset px-3 text-center text-2xs text-text-secondary',
        className,
      )}
    >
      <CloudOff className="size-icon text-text-muted" aria-hidden />
      {unavailableLabel(byo)}
    </span>
  );
}
