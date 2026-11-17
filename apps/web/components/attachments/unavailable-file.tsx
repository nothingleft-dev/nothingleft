import { CloudOff } from 'lucide-react';
import type { ByoStatus } from '@nothingleft/types';
import { cn } from '@lib/utils';

/**
 * Why a file in the organisation's own bucket cannot open: its key is failing, or the bucket was
 * disconnected. Only someone who can fix the key is told about keys.
 */
export function unavailableReason(byo: ByoStatus | null | undefined, canFix = true) {
  if (byo !== 'failed') {
    return 'It is in a storage bucket that is no longer connected. Connecting that bucket again brings it back.';
  }
  return canFix
    ? 'Its storage bucket is refusing its key, so it can’t be opened until an admin updates the key.'
    : 'The organisation’s file storage needs an admin’s attention, so this file can’t be opened for now.';
}

export function unavailableLabel(byo: ByoStatus | null | undefined, canFix = true) {
  if (byo !== 'failed') return 'Bucket disconnected';
  return canFix ? 'Bucket refusing its key' : 'File unavailable: storage needs an admin';
}

/** Drawn where an image would be, so a file that cannot open is never a broken image. */
export function UnavailableImage({
  byo,
  canFix,
  className,
}: {
  byo: ByoStatus | null | undefined;
  canFix: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 bg-inset px-3 text-center text-2xs text-balance text-text-secondary',
        className,
      )}
    >
      <CloudOff className="size-icon text-text-muted" aria-hidden />
      {unavailableLabel(byo, canFix)}
    </span>
  );
}
