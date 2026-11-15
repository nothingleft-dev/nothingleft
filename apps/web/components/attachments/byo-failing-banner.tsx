import Link from 'next/link';
import type { Route } from 'next';
import type { StorageUsage } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';

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
  return (
    <FormAlert
      className={className}
      title={
        bucket ? (
          <>
            <span className="font-mono">{bucket}</span> refused its key.
          </>
        ) : (
          'The organisation’s own storage bucket refused its key.'
        )
      }
      action={
        canFix && withAction ? (
          <Button asChild variant="outline" size="sm">
            <Link href={UPDATE_KEY_HREF as Route}>Update key</Link>
          </Button>
        ) : undefined
      }
    >
      Files there cannot be opened and uploads are paused.{' '}
      {canFix
        ? 'Save a working key for the same bucket to bring them back.'
        : 'An organisation admin has been emailed and can fix it.'}
    </FormAlert>
  );
}
