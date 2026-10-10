'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { CSV_IMPORT_ABANDONED_HOURS, type ImportJob, type ImportStatus } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { JobStatus, type JobTone } from '@components/job-status';
import { PersonName } from '@components/former-member-chip';
import { RelativeTime } from '@components/relative-time';
import { ImportErrorsTable, ImportProgress, issues, rows } from '@components/imports/import-results';
import { isImportRunning, useImports } from '@hooks/use-imports';
import { cn } from '@lib/utils';
import { formatCount } from '@lib/numbers';

const STATUS: Record<ImportStatus, [JobTone, string]> = {
  awaiting_upload: ['idle', 'Incomplete'],
  ready: ['idle', 'Not started'],
  queued: ['waiting', 'Queued'],
  running: ['moving', 'Importing'],
  completed: ['done', 'Done'],
  failed: ['failed', 'Failed'],
  expired: ['gone', 'Expired'],
};

const GRID = 'grid grid-cols-[16px_minmax(0,1fr)_112px_88px_88px_72px_148px_112px] items-center gap-3 px-3';

interface RecentImportsProps {
  project: string;
  onContinue: (job: ImportJob) => void;
}

/** Rows open in place: an import has no address of its own, since routes never carry an internal id. */
export function RecentImports({ project, onContinue }: RecentImportsProps) {
  const list = useImports(project);
  const [open, setOpen] = useState<number | null>(null);

  if (list.isPending) return <RecentSkeleton />;
  if (list.isError && !list.data) {
    return (
      <FormAlert title="Recent imports could not be loaded.">
        <button type="button" onClick={() => void list.refetch()}>
          Try again
        </button>
      </FormAlert>
    );
  }
  const jobs = list.data;
  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No imports yet."
        description="Each import is listed here with how many issues it created and the rows it skipped."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <div className="min-w-[840px]">
        <div className={cn(GRID, 'h-7 bg-app text-2xs font-medium text-text-secondary')}>
          <span />
          <span>File</span>
          <span>Status</span>
          <span className="text-right">Rows</span>
          <span className="text-right">Created</span>
          <span className="text-right">Failed</span>
          <span>Imported by</span>
          <span>Uploaded</span>
        </div>
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {jobs.map(job => (
            <ImportRow
              key={job.id}
              job={job}
              expanded={open === job.id}
              onToggle={() => setOpen(open === job.id ? null : job.id)}
              onContinue={() => onContinue(job)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

interface ImportRowProps {
  job: ImportJob;
  expanded: boolean;
  onToggle: () => void;
  onContinue: () => void;
}

function ImportRow({ job, expanded, onToggle, onContinue }: ImportRowProps) {
  const [tone, label] = STATUS[job.status];
  const ran = job.started_at !== null;
  const count = (n: number | null) => (n === null ? <span className="text-text-muted">—</span> : formatCount(n));
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(GRID, 'h-row w-full cursor-pointer text-left text-sm hover:bg-hover')}
      >
        <ChevronRight className={cn('size-icon-sm text-text-muted transition-transform', expanded && 'rotate-90')} />
        <span className="truncate font-medium" title={job.filename}>
          {job.filename}
        </span>
        <JobStatus tone={tone} label={label} />
        <span className="text-right text-text-secondary tabular">{count(job.total_rows)}</span>
        <span className="text-right text-text-secondary tabular">{ran ? count(job.created_issues) : count(null)}</span>
        <span className={cn('text-right tabular', job.failed_rows > 0 ? 'text-danger-fg' : 'text-text-secondary')}>
          {ran ? count(job.failed_rows) : count(null)}
        </span>
        <span className="min-w-0 truncate text-text-secondary">
          <PersonName person={job.created_by} />
        </span>
        <RelativeTime value={job.created_at} className="text-text-secondary" />
      </button>
      {expanded ? (
        <div className="flex flex-col gap-3 border-t border-border-subtle bg-app/50 px-9 py-4">
          <ImportDetail job={job} onContinue={onContinue} />
        </div>
      ) : null}
    </li>
  );
}

function ImportDetail({ job, onContinue }: { job: ImportJob; onContinue: () => void }) {
  if (isImportRunning(job)) return <ImportProgress job={job} />;
  switch (job.status) {
    case 'ready':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text-secondary">
            Uploaded and never started. The file is deleted {CSV_IMPORT_ABANDONED_HOURS} hours after the upload.
          </p>
          <Button size="xs" variant="outline" onClick={onContinue}>
            Map the columns
          </Button>
        </div>
      );
    case 'awaiting_upload':
      return (
        <p className="text-sm text-text-secondary">
          The upload did not finish, or the file could not be read. Choose the file again to import it.
        </p>
      );
    case 'expired':
      return (
        <p className="text-sm text-text-secondary">Never started, so the file was deleted. Nothing was created.</p>
      );
    case 'failed':
      return (
        <>
          <FormAlert title="The import stopped.">
            {job.error?.message}{' '}
            {job.created_issues > 0 ? `${issues(job.created_issues)} were created before it stopped.` : null}
          </FormAlert>
          <ImportErrorsTable errors={job.errors} failed={job.failed_rows} />
        </>
      );
    default:
      return (
        <>
          <p className="text-sm text-text-secondary">
            {issues(job.created_issues)} created
            {job.failed_rows > 0 ? `; ${rows(job.failed_rows)} failed and were skipped:` : ', every row.'}
          </p>
          <ImportErrorsTable errors={job.errors} failed={job.failed_rows} />
        </>
      );
  }
}

function RecentSkeleton() {
  return (
    <div className="divide-y divide-border-subtle rounded-md border" role="status" aria-label="Loading imports">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex h-row items-center gap-6 px-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-12" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
