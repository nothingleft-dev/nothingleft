import Link from 'next/link';
import type { Route } from 'next';
import { Ban } from 'lucide-react';
import type { StorageUsage } from '@nothingleft/types';
import { cn } from '@lib/utils';

export const UPDATE_KEY_HREF = '/organization?tab=storage&setup=update';

interface ByoFailingBannerProps {
  storage: StorageUsage | null;
  /** Known to admins only; members get the sentence without it. */
  bucket?: string | null | undefined;
  /** Org Admins and the Owner, who can fix it. */
  canFix: boolean;
  /** Off where the Update key action is already on the page. */
  withAction?: boolean;
  className?: string;
}

/** The organisation's own bucket refused its key: files there stop opening and uploads pause (file-storage.md § When the key stops working). */
export function ByoFailingBanner({ storage, bucket, canFix, withAction = true, className }: ByoFailingBannerProps) {
  if (storage?.bring_your_own !== 'failed') return null;
  const name = bucket ? (
    <span className="font-mono font-medium">{bucket}</span>
  ) : (
    'The organisation’s own storage bucket'
  );
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-md border border-danger-fg/25 bg-danger-bg px-3 py-2.5 text-danger-fg',
        className,
      )}
    >
      <Ban className="mt-0.5 size-icon-sm flex-none" />
      <p className="flex-1 text-xs leading-5">
        {name} refused its key — files there can’t be opened and uploads are paused.{' '}
        {canFix
          ? 'Enter a working key for the same bucket to bring them back.'
          : 'An organisation admin has been emailed and can fix it.'}
      </p>
      {canFix && withAction ? (
        <Link
          href={UPDATE_KEY_HREF as Route}
          className="flex-none text-xs leading-5 font-medium underline underline-offset-2 hover:no-underline"
        >
          Update key
        </Link>
      ) : null}
    </div>
  );
}
