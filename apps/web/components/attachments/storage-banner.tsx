import Link from 'next/link';
import type { Route } from 'next';
import { Ban, Info, TriangleAlert } from 'lucide-react';
import { formatBytes } from '@nothingleft/format';
import type { StorageUsage } from '@nothingleft/types';
import { cn } from '@lib/utils';

interface StorageBannerProps {
  storage: StorageUsage | null;
  /** Off inside organisation settings, which is where the link would go. */
  withLink?: boolean;
  className?: string;
}

/** limits-and-billing.md § Storage: 80% warns, 95% escalates, 100% refuses uploads and names both ways out. */
export function StorageBanner({ storage, withLink = true, className }: StorageBannerProps) {
  // The organisation's own bucket takes every upload while it is verified, so no threshold applies.
  if (!storage || storage.level === 'ok' || storage.bring_your_own === 'verified') return null;
  const used = formatBytes(storage.used_bytes);
  const limit = formatBytes(storage.limit_bytes);
  const percent = Math.min(100, Math.floor((storage.used_bytes / storage.limit_bytes) * 100));
  const full = storage.level === 'full';
  const Icon = full ? Ban : storage.level === 'critical' ? TriangleAlert : Info;

  const sentence = full
    ? `File storage is full: ${used} of ${limit} used, so new uploads are refused. Delete files you no longer need, or have an admin connect your own Cloudflare R2 or AWS S3 bucket, which lifts the limit.`
    : storage.level === 'critical'
      ? `File storage is almost full: ${used} of ${limit} used (${percent}%). Uploads stop at 100%; deleting files you no longer need makes room.`
      : `${used} of ${limit} of file storage used (${percent}%). Uploads still work; they stop at 100%.`;

  return (
    <div
      role={full ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3 py-2.5',
        full ? 'border-danger-fg/25 bg-danger-bg text-danger-fg' : 'border-warning-fg/25 bg-warning-bg text-warning-fg',
        className,
      )}
    >
      <Icon className="mt-0.5 size-icon-sm flex-none" />
      <p className="flex-1 text-xs leading-5">{sentence}</p>
      {withLink ? (
        <Link
          href={'/organization' as Route}
          className="flex-none text-xs leading-5 font-medium underline underline-offset-2 hover:no-underline"
        >
          Organisation settings
        </Link>
      ) : null}
    </div>
  );
}
