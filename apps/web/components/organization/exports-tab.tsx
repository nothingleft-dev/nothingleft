'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { formatBytes } from '@nothingleft/format';
import { ORG_EXPORT_TTL_DAYS, type ExportJob, type ExportStatus, type Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { LoadError, errorDetail } from '@components/query-state';
import { JobStatus, type JobTone } from '@components/job-status';
import { PersonName } from '@components/former-member-chip';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { isExportPending, useExports, useRequestExport } from '@hooks/use-exports';
import { exportDownloadHref } from '@lib/api/exports';
import { formatDate, formatDateTimeWithZone } from '@lib/datetime';
import { cn } from '@lib/utils';
import { formatCount } from '@lib/numbers';
import { PendingButton } from '@components/pending-button';

const STATUS: Record<ExportStatus, [JobTone, string]> = {
  queued: ['waiting', 'Queued'],
  running: ['moving', 'Building'],
  completed: ['done', 'Ready'],
  failed: ['failed', 'Failed'],
  expired: ['gone', 'Expired'],
};

const files = (n: number) => `${formatCount(n)} ${n === 1 ? 'file' : 'files'}`;

export function ExportsTab({ organization }: { organization: Organization }) {
  const slug = organization.slug;
  const exports = useExports(slug);
  const request = useRequestExport(slug);
  const [returned, setReturned] = useState<ExportJob | null>(null);

  const jobs = exports.data ?? [];
  const pending = jobs.find(isExportPending) ?? null;
  const stillReturned = returned && pending?.id === returned.id ? pending : null;

  const start = () => {
    const before = new Set(jobs.map(j => j.id));
    setReturned(null);
    request.mutate(undefined, { onSuccess: job => setReturned(before.has(job.id) ? job : null) });
  };

  const busy = pending !== null && !request.isPending;

  return (
    <>
      <SettingsSection
        title="Export organisation"
        description={`One .zip of every project, issue, article, file, member and the audit log. Emailed when ready, kept ${ORG_EXPORT_TTL_DAYS} days.`}
        actions={
          <PendingButton
            size="sm"
            variant={busy ? 'outline' : 'default'}
            onClick={start}
            pending={request.isPending}
            pendingLabel="Requesting…"
          >
            Export organisation
          </PendingButton>
        }
      >
        <p className="max-w-[72ch] text-xs text-text-secondary sm:-mt-2.5">
          Not included: the trash, private saved views, notifications, personal settings and secrets.
        </p>
        {request.isError ? <FormAlert title={`The export was not requested. ${request.error.message}`} /> : null}
        {busy ? (
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2.5 text-sm"
            role="status"
          >
            <JobStatus tone="moving" label="Building" />
            <span className="text-text-secondary">
              {stillReturned ? (
                <>
                  One export runs at a time. The one{' '}
                  <PersonName person={stillReturned.created_by} className="text-text" /> asked for{' '}
                  <RelativeTime value={stillReturned.created_at} className="text-text-secondary" /> is the first row
                  below.
                </>
              ) : (
                'An export is being built. This page updates by itself, and the email goes out when it is ready.'
              )}
            </span>
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Recent exports">
        {exports.isPending ? (
          <ExportsSkeleton />
        ) : exports.isError && !exports.data ? (
          <LoadError onRetry={() => void exports.refetch()} detail={errorDetail(exports.error)}>
            The exports could not be loaded.
          </LoadError>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No exports yet."
            description="Export organisation builds the first one. Each request is written to the audit log."
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border max-sm:hidden">
              <table className={TABLE}>
                <ExportsHead />
                <tbody className="divide-y divide-border-subtle">
                  {jobs.map(job => (
                    <ExportRow key={job.id} job={job} onRequest={pending ? undefined : start} />
                  ))}
                </tbody>
              </table>
            </div>
            <ul
              className="flex flex-col divide-y divide-border-subtle rounded-md border sm:hidden"
              aria-label="Recent exports"
            >
              {jobs.map(job => (
                <ExportItem key={job.id} job={job} onRequest={pending ? undefined : start} />
              ))}
            </ul>
          </>
        )}
      </SettingsSection>
    </>
  );
}

const dash = <span className="text-text-muted">–</span>;

function ExportRow({ job, onRequest }: { job: ExportJob; onRequest: (() => void) | undefined }) {
  const [tone, label] = STATUS[job.status];
  const href = exportDownloadHref(job);
  return (
    <tr className="h-row align-middle">
      <td className="px-3">
        <JobStatus tone={tone} label={label} />
      </td>
      <td className="truncate px-3">
        <PersonName person={job.created_by} />
      </td>
      <td className="px-3 whitespace-nowrap">
        <RelativeTime value={job.created_at} className="text-text-secondary" />
      </td>
      <td className="px-3 text-right tabular text-text-secondary">
        {job.size_bytes !== null ? formatBytes(job.size_bytes) : dash}
      </td>
      {job.status === 'failed' ? (
        <td colSpan={2} className="px-3">
          <FailureReason job={job} />
        </td>
      ) : (
        <>
          <td className="px-3 text-text-secondary tabular">
            <FileCount job={job} />
          </td>
          <td className={cn('px-3', job.status === 'expired' ? 'text-text-muted' : 'text-text-secondary')}>
            <ExpiresAt job={job} />
          </td>
        </>
      )}
      <td className="px-3 text-right">
        <ExportAction job={job} href={href} onRequest={onRequest} />
      </td>
    </tr>
  );
}

function ExportItem({ job, onRequest }: { job: ExportJob; onRequest: (() => void) | undefined }) {
  const [tone, label] = STATUS[job.status];
  const href = exportDownloadHref(job);
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <JobStatus tone={tone} label={label} />
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs text-text-secondary">
          <PersonName person={job.created_by} className="text-text-secondary" />
          <span aria-hidden>·</span>
          <RelativeTime value={job.created_at} className="text-text-secondary" />
          {job.status === 'completed' && job.size_bytes !== null ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">{formatBytes(job.size_bytes)}</span>
            </>
          ) : null}
        </span>
        {job.status === 'failed' ? <FailureReason job={job} /> : null}
      </div>
      <ExportAction job={job} href={href} onRequest={onRequest} />
    </li>
  );
}

function FailureReason({ job }: { job: ExportJob }) {
  const message = job.error?.message ?? 'The export stopped before it was ready.';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="block truncate text-xs text-text-secondary">
          {message}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-xs">
        {message}
      </TooltipContent>
    </Tooltip>
  );
}

function FileCount({ job }: { job: ExportJob }) {
  const missing = job.missing_file_count ?? 0;
  return (
    <>
      {job.file_count !== null ? files(job.file_count) : dash}
      {missing > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="ml-1.5 cursor-help font-medium text-warning-fg">
              {missing} missing
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {missing === 1 ? 'One file' : `${missing} files`} could not be included: deleted from storage, or in your
            own bucket while it was not answering. manifest.json in the archive names each one.
          </TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
}

function ExpiresAt({ job }: { job: ExportJob }) {
  return job.expires_at ? (
    <span title={formatDateTimeWithZone(job.expires_at)}>{formatDate(job.expires_at)}</span>
  ) : (
    dash
  );
}

function ExportAction({
  job,
  href,
  onRequest,
}: {
  job: ExportJob;
  href: string | null;
  onRequest: (() => void) | undefined;
}) {
  if (href) {
    return (
      <Button asChild variant="outline" size="xs" className="gap-1.5">
        <a href={href}>
          <Download />
          Download
        </a>
      </Button>
    );
  }
  if (job.status === 'failed' && onRequest) {
    return (
      <Button variant="outline" size="xs" onClick={onRequest}>
        Request again
      </Button>
    );
  }
  return null;
}

const TABLE = 'w-full min-w-[940px] table-fixed text-sm';

function ExportsHead() {
  return (
    <thead className="bg-app text-left text-2xs text-text-secondary">
      <tr>
        <th className="h-7 w-28 px-3 font-medium">Status</th>
        <th className="w-44 px-3 font-medium">Requested by</th>
        <th className="w-32 px-3 font-medium">Requested</th>
        <th className="w-24 px-3 text-right font-medium">Size</th>
        <th className="w-40 px-3 font-medium">Files</th>
        <th className="w-36 px-3 font-medium">Download until</th>
        <th className="px-3" aria-label="Actions" />
      </tr>
    </thead>
  );
}

function ExportsSkeleton() {
  return (
    <div className="overflow-x-auto rounded-md border" role="status" aria-label="Loading exports">
      <table className={TABLE} aria-hidden>
        <ExportsHead />
        <tbody className="divide-y divide-border-subtle">
          {Array.from({ length: 3 }, (_, i) => (
            <tr key={i} className="h-row">
              <td className="px-3">
                <Skeleton className="h-3 w-16" />
              </td>
              <td className="px-3">
                <Skeleton className="h-3 w-28" />
              </td>
              <td className="px-3">
                <Skeleton className="h-3 w-20" />
              </td>
              <td className="px-3">
                <Skeleton className="ml-auto h-3 w-12" />
              </td>
              <td className="px-3">
                <Skeleton className="h-3 w-16" />
              </td>
              <td className="px-3">
                <Skeleton className="h-3 w-20" />
              </td>
              <td className="px-3">
                <Skeleton className="ml-auto h-6 w-20" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
