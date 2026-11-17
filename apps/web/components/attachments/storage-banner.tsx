'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { formatBytes } from '@nothingleft/format';
import type { StorageUsage } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { useStorage } from '@hooks/use-attachments';

interface StorageBannerProps {
  storage: StorageUsage | null;
  /** Off inside organisation settings, which is where the link would go. */
  withLink?: boolean;
  className?: string;
}

/** limits-and-billing.md § Storage: 80% warns, 95% escalates, 100% refuses uploads and names both ways out. */
export function StorageBanner({ storage, withLink = true, className }: StorageBannerProps) {
  const { canManage } = useStorage();
  // The organisation's own bucket takes every upload while it is verified, so no threshold applies.
  if (!storage || storage.level === 'ok' || storage.bring_your_own === 'verified') return null;
  const used = formatBytes(storage.used_bytes);
  const limit = formatBytes(storage.limit_bytes);
  const percent = Math.min(100, Math.floor((storage.used_bytes / storage.limit_bytes) * 100));
  const full = storage.level === 'full';

  const title = full
    ? 'File storage is full.'
    : storage.level === 'critical'
      ? 'File storage is almost full.'
      : `${percent}% of file storage is used.`;
  const body = full
    ? canManage
      ? `${used} of ${limit}. New uploads are refused until files are deleted or your own bucket is connected.`
      : `${used} of ${limit}. New uploads are refused until files are deleted or an admin connects the organisation’s own bucket.`
    : storage.level === 'critical'
      ? `${used} of ${limit} (${percent}%). Uploads stop at 100%.`
      : `${used} of ${limit}. Uploads stop at 100%.`;

  return (
    <FormAlert
      tone={full ? 'danger' : 'warning'}
      title={title}
      className={className}
      action={
        withLink && canManage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={'/organization?tab=storage' as Route}>Manage storage</Link>
          </Button>
        ) : undefined
      }
    >
      {body}
    </FormAlert>
  );
}
