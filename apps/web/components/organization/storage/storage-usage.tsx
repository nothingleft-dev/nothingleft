import { formatBytes } from '@nothingleft/format';
import type { StorageOverview } from '@nothingleft/types';
import { Meter } from '@components/dashboard/meter';
import { StatRow } from '@components/dashboard/stat-row';
import { Skeleton } from '@components/ui/skeleton';
import { cn } from '@lib/utils';
import { plural } from '@lib/numbers';

const files = (n: number) => `${plural(n, 'file')}`;

const LEVEL_INK = { ok: 'text-text', warning: 'text-warning-fg', critical: 'text-danger-fg', full: 'text-danger-fg' };

/** The figures on top of the storage tab: what counts, what is shown but never counted, and what is counted but not listed. */
export function StorageUsage({ overview, compact = false }: { overview: StorageOverview; compact?: boolean }) {
  const { platform, bring_your_own: own, unclaimed, awaiting_purge: purge, connection, earlier_buckets } = overview;
  // A bucket that verified once keeps the limit lifted while it refuses its key; uploads pause instead.
  const connected = connection !== null && connection.verified_at !== null;
  const failing = connected && connection.status === 'failed';
  const share = (platform.bytes / platform.limit_bytes) * 100;
  const percent = share > 0 && share < 1 ? '<1' : String(Math.min(100, Math.floor(share)));
  const everOwn = connection !== null || own.files > 0 || earlier_buckets.length > 0;

  return (
    <section aria-label="Storage usage" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-text-secondary">
            {connected ? (
              <>
                <span className="text-xl font-semibold tracking-tight text-text">No limit</span>
                {failing ? (
                  <span className="ml-2 font-medium text-danger-fg">Uploads paused</span>
                ) : (
                  <span className="ml-2">
                    new files go to <span className="font-mono text-text">{connection.bucket}</span>
                  </span>
                )}
              </>
            ) : (
              <>
                <span className={cn('text-xl font-semibold tracking-tight tabular', LEVEL_INK[platform.level])}>
                  {formatBytes(platform.bytes)}
                </span>
                <span className="ml-2">of {formatBytes(platform.limit_bytes)} used</span>
              </>
            )}
          </p>
          {connected ? null : (
            <span className={cn('text-xs font-medium tabular', LEVEL_INK[platform.level])}>{percent}%</span>
          )}
        </div>
        {connected ? null : (
          <Meter
            ratio={platform.bytes / platform.limit_bytes}
            quota={platform.level !== 'ok'}
            label="Built-in storage used"
            className="h-1.5 bg-border"
          />
        )}
        <p className="text-xs text-text-secondary">
          {connected
            ? platform.files > 0
              ? `${formatBytes(platform.bytes)} is still in the built-in storage and no longer counts against a limit.`
              : 'Every file is in your own bucket. Avatars stay in the built-in storage and never count.'
            : platform.level === 'full'
              ? 'New uploads are refused until there is room. Delete files below, or connect your own bucket.'
              : platform.level === 'critical'
                ? 'Almost full. Delete files below, or connect your own bucket.'
                : 'Everything attached to an issue, a comment, spent time or an article counts. Avatars never do.'}
        </p>
      </div>

      {compact ? null : (
        <StatRow
          stats={[
            { label: 'Built-in storage', value: formatBytes(platform.bytes), unit: files(platform.files) },
            ...(everOwn ? [{ label: 'Your own bucket', value: formatBytes(own.bytes), unit: files(own.files) }] : []),
            {
              label: 'Unclaimed uploads',
              value: formatBytes(unclaimed.bytes),
              unit: files(unclaimed.files),
              below: <Caption>Unsaved forms. Removed in 2 days.</Caption>,
            },
            {
              label: 'Awaiting purge',
              value: formatBytes(purge.bytes),
              unit: files(purge.files),
              below: <Caption>Deleted items. Removed in 14 days.</Caption>,
            },
          ]}
        />
      )}
    </section>
  );
}

const Caption = ({ children }: { children: string }) => (
  <span className="mt-0.5 text-2xs text-pretty text-text-secondary">{children}</span>
);

export function StorageUsageSkeleton({ ownBucket = false }: { ownBucket?: boolean }) {
  const labels = ['Built-in storage', ...(ownBucket ? ['Your own bucket'] : []), 'Unclaimed uploads', 'Awaiting purge'];
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading storage usage">
      <div className="flex flex-col gap-2">
        <div className="flex h-7 items-center justify-between gap-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-1.5 w-full" />
        <div className="flex h-[18px] items-center">
          <Skeleton className="h-3 w-96 max-w-full" />
        </div>
      </div>
      <StatRow
        stats={labels.map((label, i) => ({
          label,
          value: <Skeleton className="my-1 h-5 w-12" />,
          below:
            i >= labels.length - 2 ? (
              <span className="mt-0.5 flex h-4 items-center">
                <Skeleton className="h-3 w-40 max-w-full" />
              </span>
            ) : undefined,
        }))}
      />
    </div>
  );
}
