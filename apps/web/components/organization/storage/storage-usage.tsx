import { formatBytes } from '@nothingleft/format';
import type { StorageOverview } from '@nothingleft/types';
import { Meter } from '@components/dashboard/meter';
import { StatRow } from '@components/dashboard/stat-row';
import { Skeleton } from '@components/ui/skeleton';
import { cn } from '@lib/utils';

const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

const LEVEL_INK = { ok: 'text-text', warning: 'text-warning-fg', critical: 'text-danger-fg', full: 'text-danger-fg' };

/** The figures on top of the storage tab: what counts, what is shown but never counted, and what is counted but not listed. */
export function StorageUsage({ overview }: { overview: StorageOverview }) {
  const { platform, bring_your_own: own, unclaimed, awaiting_purge: purge, connection } = overview;
  const verified = connection?.status === 'verified';
  const share = (platform.bytes / platform.limit_bytes) * 100;
  const percent = share > 0 && share < 1 ? '<1' : String(Math.min(100, Math.floor(share)));

  return (
    <section aria-label="Storage usage" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-text-secondary">
            {verified ? (
              <>
                <span className="text-xl font-semibold tracking-tight text-text">No limit</span>
                <span className="ml-2">
                  new files go to <span className="font-mono text-text">{connection.bucket}</span>
                </span>
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
          {verified ? null : (
            <span className={cn('text-xs font-medium tabular', LEVEL_INK[platform.level])}>{percent}%</span>
          )}
        </div>
        {verified ? null : (
          <Meter ratio={platform.bytes / platform.limit_bytes} quota label="Built-in storage used" className="h-1.5" />
        )}
        <p className="text-xs text-text-secondary">
          {verified
            ? platform.files > 0
              ? `${formatBytes(platform.bytes)} is still in the built-in storage and no longer counts against a limit.`
              : 'Every file is in your own bucket. Avatars stay in the built-in storage and never count.'
            : platform.level === 'full'
              ? 'New uploads are refused until there is room. Delete files below, or connect your own bucket.'
              : 'Everything attached to an issue, a comment, spent time or an article counts. Avatars never do.'}
        </p>
      </div>

      <StatRow
        stats={[
          { label: 'Built-in storage', value: formatBytes(platform.bytes), unit: files(platform.files) },
          { label: 'Your own bucket', value: formatBytes(own.bytes), unit: files(own.files) },
          { label: 'Unclaimed uploads', value: formatBytes(unclaimed.bytes), unit: files(unclaimed.files) },
          { label: 'Awaiting purge', value: formatBytes(purge.bytes), unit: files(purge.files) },
        ]}
      />

      <dl className="grid gap-x-8 gap-y-2 text-xs leading-5 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-text">Unclaimed uploads</dt>
          <dd className="text-text-secondary">
            Files someone attached to a form they never saved. Only they can see them, and they are removed after two
            days.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-text">Awaiting purge</dt>
          <dd className="text-text-secondary">
            Files of a deleted issue or article. They stay while it can still be restored, for 14 days, and are then
            removed with it. The list shows them with the date they go.
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function StorageUsageSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading storage usage">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-1.5 w-full" />
      <div className="grid grid-cols-4 gap-4 border-y py-3 max-sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
