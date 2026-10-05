'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { CloudOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatBytes } from '@nothingleft/format';
import type { ByoStatus, StorageFile, StorageTarget } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { PersonName } from '@components/former-member-chip';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { FileBadge } from '@components/attachments/file-badge';
import { unavailableReason } from '@components/attachments/unavailable-file';
import { ReportPicker } from '@components/reports/report-picker';
import { useProjects } from '@hooks/use-projects';
import { STORAGE_FILES_PAGE, useDeleteStorageFile, useStorageFiles } from '@hooks/use-organization-storage';
import type { StorageFilesFilter } from '@lib/api/organization-storage';
import { formatDate, formatDateTimeWithZone } from '@lib/datetime';
import { isInlineImage } from '@lib/files';
import { cn } from '@lib/utils';

export interface FilesFilter {
  sort: 'size' | 'created';
  target: StorageTarget | null;
  project: string | null;
  offset: number;
}

interface StorageFilesProps {
  slug: string;
  filter: FilesFilter;
  onFilterChange: (next: FilesFilter) => void;
  /** The connection's state, which says why a file in the organisation's bucket cannot open. */
  byo: ByoStatus | null;
  bucket: string | null;
  timeZone?: string | undefined;
}

const SORTS = [
  { value: 'size', label: 'Largest first' },
  { value: 'created', label: 'Newest first' },
];
const TARGETS = [
  { value: 'all', label: 'Everywhere' },
  { value: 'platform', label: 'Built-in storage' },
  { value: 'byo', label: 'Your own bucket' },
];

export function StorageFiles({ slug, filter, onFilterChange, byo, bucket, timeZone }: StorageFilesProps) {
  const query: StorageFilesFilter = {
    sort: filter.sort,
    target: filter.target ?? undefined,
    project: filter.project ?? undefined,
    offset: filter.offset,
  };
  const files = useStorageFiles(slug, query);
  const projects = useProjects({ limit: 100 });
  const remove = useDeleteStorageFile(slug);
  const [deleting, setDeleting] = useState<StorageFile | null>(null);

  const rows = files.data?.data ?? [];
  const total = files.data?.meta.pagination?.total ?? 0;
  const narrowed = filter.target !== null || filter.project !== null;
  const set = (patch: Partial<FilesFilter>) => onFilterChange({ ...filter, offset: 0, ...patch });

  const projectOptions = [
    { value: '', label: 'All projects' },
    ...(projects.data ?? []).map(p => ({ value: p.key, label: p.name, mark: <ProjectKey value={p.key} /> })),
  ];
  if (filter.project && !projectOptions.some(o => o.value === filter.project)) {
    projectOptions.push({ value: filter.project, label: filter.project, mark: <ProjectKey value={filter.project} /> });
  }

  return (
    <SettingsSection
      title="Files"
      description="Every file on an issue, a comment, spent time or an article. Deleting one frees its space at once; the issue or article loses it too."
    >
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filter files">
        <ReportPicker
          label="Sort"
          value={filter.sort}
          options={SORTS}
          onChange={v => set({ sort: v as FilesFilter['sort'] })}
          width="w-48"
        />
        <ReportPicker
          label="Project"
          value={filter.project ?? ''}
          options={projectOptions}
          loading={projects.isPending}
          searchable
          onChange={v => set({ project: v === '' ? null : v })}
        />
        <ReportPicker
          label="Stored in"
          value={filter.target ?? 'all'}
          options={TARGETS}
          onChange={v => set({ target: v === 'all' ? null : (v as StorageTarget) })}
          width="w-52"
        />
        {files.isFetching && !files.isPending ? (
          <span className="text-2xs text-text-muted" role="status">
            Updating…
          </span>
        ) : null}
      </div>

      {files.isPending ? (
        <FilesSkeleton />
      ) : files.isError ? (
        <FormAlert title="The file list could not be loaded.">
          <button type="button" onClick={() => void files.refetch()}>
            Try again
          </button>
        </FormAlert>
      ) : rows.length === 0 && narrowed ? (
        <EmptyState
          title="No files match these filters."
          description={`Nothing ${filter.target === 'byo' ? 'in your own bucket' : filter.target === 'platform' ? 'in the built-in storage' : 'stored'}${filter.project ? ` in ${filter.project}` : ''}.`}
          action={
            <Button variant="outline" size="xs" onClick={() => set({ target: null, project: null })}>
              Show every file
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No files yet."
          description="Files attached to issues, comments, spent time and articles appear here, largest first."
        />
      ) : (
        <div className={cn('overflow-x-auto rounded-md border', files.isPlaceholderData && 'opacity-60')}>
          <table className="w-full min-w-[880px] table-fixed text-sm">
            <thead className="bg-app text-left text-2xs text-text-secondary">
              <tr>
                <th className="h-7 px-3 font-medium">File</th>
                <th className="w-24 px-3 text-right font-medium">Size</th>
                <th className="w-[22%] px-3 font-medium">On</th>
                <th className="w-32 px-3 font-medium">Stored in</th>
                <th className="w-36 px-3 font-medium">Uploaded by</th>
                <th className="w-28 px-3 font-medium">Uploaded</th>
                <th className="w-36 px-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map(file => (
                <FileRow
                  key={file.id}
                  file={file}
                  byo={byo}
                  bucket={bucket}
                  timeZone={timeZone}
                  deleting={remove.isPending && remove.variables?.id === file.id}
                  onDelete={() => setDeleting(file)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > STORAGE_FILES_PAGE ? (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Button
            variant="outline"
            size="xs"
            disabled={filter.offset === 0}
            onClick={() => onFilterChange({ ...filter, offset: Math.max(0, filter.offset - STORAGE_FILES_PAGE) })}
          >
            Previous
          </Button>
          <span className="tabular">
            {filter.offset + 1}–{Math.min(filter.offset + STORAGE_FILES_PAGE, total)} of {total}
          </span>
          <Button
            variant="outline"
            size="xs"
            disabled={filter.offset + STORAGE_FILES_PAGE >= total}
            onClick={() => onFilterChange({ ...filter, offset: filter.offset + STORAGE_FILES_PAGE })}
          >
            Next
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => (open ? undefined : setDeleting(null))}
        title={`Delete ${deleting?.filename ?? 'this file'}?`}
        confirmLabel="Delete file"
        onConfirm={() => {
          if (!deleting) return;
          const file = deleting;
          setDeleting(null);
          remove.mutate(file, {
            onError: error => toast.error(`${file.filename} was not deleted. ${error.message}`),
          });
        }}
      >
        {deleting ? (
          <>
            <p>
              It leaves {holderName(deleting)} for everyone and cannot be restored. Any link to it, or image of it in
              the text, stops working.
            </p>
            <p>
              {deleting.storage_target === 'platform'
                ? `${formatBytes(deleting.size_bytes)} of the built-in storage is free again at once.`
                : deleting.available
                  ? `It is deleted from ${bucket ?? 'your own bucket'} too, which frees ${formatBytes(deleting.size_bytes)} there.`
                  : byo === 'failed'
                    ? `It is deleted from ${bucket ?? 'your own bucket'} once the bucket accepts its key again.`
                    : 'Its copy stays in the earlier bucket, which is no longer connected; delete it there if you want it gone.'}
            </p>
          </>
        ) : null}
      </ConfirmDialog>
    </SettingsSection>
  );
}

function holderName(file: StorageFile) {
  if (file.article) return `the article “${file.article.title}”`;
  return file.issue ?? file.project;
}

function ProjectKey({ value }: { value: string }) {
  return <span className="w-10 flex-none font-mono text-2xs text-text-muted">{value}</span>;
}

interface FileRowProps {
  file: StorageFile;
  byo: ByoStatus | null;
  bucket: string | null;
  timeZone?: string | undefined;
  deleting: boolean;
  onDelete: () => void;
}

function FileRow({ file, byo, bucket, timeZone, deleting, onDelete }: FileRowProps) {
  const image = isInlineImage(file.mime_type);
  return (
    <tr className={cn('h-10', deleting && 'opacity-50')}>
      <td className="px-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <Thumbnail file={file} image={image} />
          {file.available ? (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-text hover:underline hover:underline-offset-2"
            >
              {file.filename}
            </a>
          ) : (
            <span className="min-w-0 truncate text-text-secondary">{file.filename}</span>
          )}
        </span>
      </td>
      <td className="px-3 text-right font-mono text-xs whitespace-nowrap tabular">{formatBytes(file.size_bytes)}</td>
      <td className="px-3">
        <Holder file={file} />
      </td>
      <td className="px-3 text-xs whitespace-nowrap">
        {file.available ? (
          <span className="text-text-secondary">
            {file.storage_target === 'byo' ? (
              bucket ? (
                <span className="font-mono">{bucket}</span>
              ) : (
                'Your own bucket'
              )
            ) : (
              'Built-in'
            )}
          </span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex items-center gap-1.5 text-warning-fg">
                <CloudOff className="size-icon-sm" aria-hidden />
                Unavailable
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{unavailableReason(byo)}</TooltipContent>
          </Tooltip>
        )}
      </td>
      <td className="px-3 text-xs">
        <PersonName person={file.created_by} className="max-w-full text-text-secondary" />
      </td>
      <td className="px-3 text-xs whitespace-nowrap">
        <RelativeTime value={file.created_at} timeZone={timeZone} />
      </td>
      <td className="px-3 text-right">
        {file.purges_at ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="text-xs whitespace-nowrap text-text-secondary">
                Goes {formatDate(file.purges_at, timeZone)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Its {file.article ? 'article' : 'issue'} was deleted. The file is removed with it on{' '}
              {formatDateTimeWithZone(file.purges_at, timeZone)}, unless it is restored first.
            </TooltipContent>
          </Tooltip>
        ) : file.me.can_delete ? (
          <Button
            variant="ghost"
            size="xs"
            className="text-text-secondary hover:text-danger-fg"
            disabled={deleting}
            onClick={onDelete}
            aria-label={`Delete ${file.filename}`}
          >
            <Trash2 /> Delete
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

function Thumbnail({ file, image }: { file: StorageFile; image: boolean }) {
  const [broken, setBroken] = useState(false);
  if (!file.available) {
    return (
      <span className="grid size-7 flex-none place-items-center rounded-sm border border-dashed bg-inset" aria-hidden>
        <CloudOff className="size-3.5 text-text-muted" />
      </span>
    );
  }
  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a private file behind a redirect; next/image cannot fetch it
      <img
        src={file.url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="size-7 flex-none rounded-sm border bg-inset object-cover"
      />
    );
  }
  return <FileBadge filename={file.filename} mime={file.mime_type} className="h-7 w-7 flex-none" />;
}

function Holder({ file }: { file: StorageFile }) {
  const part =
    file.comment_id !== null
      ? `comment ${file.comment_id}`
      : file.work_item_id !== null
        ? `work item #${file.work_item_id}`
        : null;
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-xs">
      {file.article ? (
        <Link
          href={`/projects/${file.project}/articles/${file.article.slug}` as Route}
          className="min-w-0 truncate text-text hover:underline hover:underline-offset-2"
        >
          {file.article.title}
        </Link>
      ) : file.issue ? (
        <Link
          href={`/issue/${file.issue}` as Route}
          className="font-mono text-2xs text-text hover:underline hover:underline-offset-2"
        >
          {file.issue}
        </Link>
      ) : (
        <span className="font-mono text-2xs text-text-secondary">{file.project}</span>
      )}
      {part ? <span className="flex-none whitespace-nowrap text-text-secondary">{part}</span> : null}
    </span>
  );
}

export function FilesSkeleton() {
  return (
    <div
      className="flex flex-col divide-y divide-border-subtle rounded-md border"
      role="status"
      aria-label="Loading files"
    >
      <div className="h-7 bg-app" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex h-10 items-center gap-3 px-3">
          <Skeleton className="size-7 rounded-sm" />
          <Skeleton className="h-3" style={{ width: `${18 + ((i * 13) % 20)}%` }} />
          <Skeleton className="ml-auto h-3 w-14" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
