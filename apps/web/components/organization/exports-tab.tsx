'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { formatBytes } from '@nothingleft/format';
import { ORG_EXPORT_TTL_DAYS, type ExportJob, type ExportStatus, type Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { JobStatus, type JobTone } from '@components/job-status';
import { PersonName } from '@components/former-member-chip';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { isExportPending, useExports, useRequestExport } from '@hooks/use-exports';
import { exportDownloadHref } from '@lib/api/exports';
import { formatDate, formatDateTimeWithZone } from '@lib/datetime';
import { cn } from '@lib/utils';
import { formatCount } from '@lib/numbers';

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

  return (
    <>
      <SettingsSection
        title="Export organisation"
        description={`One .zip with every project, issue, article and attached file, the members and the audit log — wherever the files are stored. It is built in the background and emailed to you when ready, then kept here for ${ORG_EXPORT_TTL_DAYS} days for any Org Admin or the Owner to download.`}
        actions={
          <Button size="sm" onClick={start} disabled={request.isPending}>
            {request.isPending ? 'Requesting…' : 'Export organisation'}
          </Button>
        }
      >
        {request.isError ? <FormAlert title={`The export was not requested. ${request.error.message}`} /> : null}
        {stillReturned ? (
          <p className="text-sm text-text-secondary" role="status">
            One export runs at a time. The one <PersonName person={stillReturned.created_by} className="text-text" />{' '}
            asked for <RelativeTime value={stillReturned.created_at} className="text-text-secondary" /> is still being
            built; it is the first row below.
          </p>
        ) : pending && !request.isPending ? (
          <p className="text-sm text-text-secondary" role="status">
            An export is being built. This page checks on it every few seconds, and the email goes out when it is ready.
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Recent exports"
        description="Not included: the trash, private saved views, notifications, personal settings and secrets."
      >
        {exports.isPending ? (
          <ExportsSkeleton />
        ) : exports.isError && !exports.data ? (
          <FormAlert title="The exports could not be loaded.">
            <button type="button" onClick={() => void exports.refetch()}>
              Try again
            </button>
          </FormAlert>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No exports yet."
            description="Export organisation builds the first one. Each request is written to the audit log."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[760px] table-fixed text-sm">
              <thead className="bg-app text-left text-2xs text-text-secondary">
                <tr>
                  <th className="h-7 w-28 px-3 font-medium">Status</th>
                  <th className="px-3 font-medium">Requested by</th>
                  <th className="w-32 px-3 font-medium">Requested</th>
                  <th className="w-24 px-3 text-right font-medium">Size</th>
                  <th className="w-40 px-3 font-medium">Files</th>
                  <th className="w-36 px-3 font-medium">Download until</th>
                  <th className="w-28 px-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {jobs.map(job => (
                  <ExportRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>
    </>
  );
}

function ExportRow({ job }: { job: ExportJob }) {
  const [tone, label] = STATUS[job.status];
  const href = exportDownloadHref(job);
  const missing = job.missing_file_count ?? 0;
  return (
    <tr className="h-row align-middle">
      <td className="px-3">
        {job.status === 'failed' && job.error ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">
                <JobStatus tone={tone} label={label} />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{job.error.message}</TooltipContent>
          </Tooltip>
        ) : (
          <JobStatus tone={tone} label={label} />
        )}
      </td>
      <td className="truncate px-3">
        <PersonName person={job.created_by} />
      </td>
      <td className="px-3 whitespace-nowrap">
        <RelativeTime value={job.created_at} className="text-text-secondary" />
      </td>
      <td className="px-3 text-right font-mono text-xs tabular text-text-secondary">
        {job.size_bytes !== null ? formatBytes(job.size_bytes) : <span className="text-text-muted">—</span>}
      </td>
      <td className="px-3 text-text-secondary tabular">
        {job.file_count !== null ? files(job.file_count) : <span className="text-text-muted">—</span>}
        {missing > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-1.5 cursor-help font-medium text-warning-fg">{missing} missing</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {missing === 1 ? 'One file' : `${missing} files`} could not be included: deleted from storage, or in your
              own bucket while it was not answering. manifest.json in the archive names each one.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </td>
      <td className={cn('px-3', job.status === 'expired' ? 'text-text-muted' : 'text-text-secondary')}>
        {job.expires_at ? (
          <span title={formatDateTimeWithZone(job.expires_at)}>{formatDate(job.expires_at)}</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-3 text-right">
        {href ? (
          <Button asChild variant="outline" size="xs" className="gap-1.5">
            <a href={href}>
              <Download />
              Download
            </a>
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

function ExportsSkeleton() {
  return (
    <div className="divide-y divide-border-subtle rounded-md border" role="status" aria-label="Loading exports">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex h-row items-center gap-6 px-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-14" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}
