'use client';

import { useState, type MouseEvent } from 'react';
import { CloudOff, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatBytes } from '@nothingleft/format';
import type { Attachment, ByoStatus } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { ConfirmDialog } from '@components/confirm-dialog';
import { PersonName } from '@components/former-member-chip';
import { FileBadge } from '@components/attachments/file-badge';
import { Lightbox, imageGallery, type LightboxImage } from '@components/attachments/lightbox';
import { StorageBanner } from '@components/attachments/storage-banner';
import { ByoFailingBanner } from '@components/attachments/byo-failing-banner';
import { UnavailableImage, unavailableReason } from '@components/attachments/unavailable-file';
import { UploadTray } from '@components/attachments/upload-tray';
import { useDeleteAttachment, useStorage, type Uploader } from '@hooks/use-attachments';
import { useStorageOverview } from '@hooks/use-organization-storage';
import { formatDateTime } from '@lib/datetime';
import { isInlineImage } from '@lib/files';
import { cn } from '@lib/utils';

interface AttachmentsSectionProps {
  issueKey: string;
  files: readonly Attachment[] | undefined;
  loading: boolean;
  /** The section's own uploads: files attached to the issue, not placed in any text. */
  uploader: Uploader | null;
  onAttach: () => void;
  timeZone?: string | undefined;
}

const hasModifier = (event: MouseEvent) => event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;

/**
 * Hidden entirely while the issue has no files (owner, 25 Sep 2026); *Attach files* then lives in the
 * title row. Files already shown in the description or a comment hide behind *Hidden files N*.
 */
export function AttachmentsSection({
  issueKey,
  files,
  loading,
  uploader,
  onAttach,
  timeZone,
}: AttachmentsSectionProps) {
  const { storage, available, slug, canManage } = useStorage();
  const failing = storage?.bring_your_own === 'failed';
  // Only an admin may read the bucket's name; members get the same sentence without it.
  const overview = useStorageOverview(slug ?? '', slug !== null && canManage && failing);
  const [showHidden, setShowHidden] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [zoomed, setZoomed] = useState<LightboxImage | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const remove = useDeleteAttachment(issueKey);

  const all = files ?? [];
  const inTray = uploader?.uploads.some(u => u.status !== 'done') ?? false;
  if (!loading && all.length === 0 && !inTray) return null;

  const hidden = all.filter(f => f.inline);
  const listed = all.filter(f => !f.inline);
  const shown = showHidden ? all : listed;
  const images = shown.filter(f => isInlineImage(f.mime_type));
  const others = shown.filter(f => !isInlineImage(f.mime_type));
  const canUpload = uploader !== null && available;

  return (
    <section
      className={cn(
        'mt-8 rounded-md',
        dragging && 'bg-hover outline-2 outline-offset-4 outline-dashed outline-border-strong',
      )}
      aria-label="Attachments"
      onDragOver={event => {
        if (!canUpload || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={event => {
        setDragging(false);
        if (!canUpload || event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        uploader.start([...event.dataTransfer.files]);
      }}
    >
      <div className="flex min-h-control flex-wrap items-center gap-x-3 gap-y-1 border-b">
        <h2 className="text-sm font-semibold">
          Attachments <span className="ml-1 font-normal tabular text-text-muted">{listed.length}</span>
        </h2>
        {hidden.length > 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span aria-hidden className="text-text-muted">
              ·
            </span>
            Hidden files <span className="tabular">{hidden.length}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={showHidden}
                  onClick={() => setShowHidden(on => !on)}
                  className="rounded-xs px-1 text-text underline underline-offset-2 hover:no-underline"
                >
                  {showHidden ? 'Hide' : 'Show'}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {hidden.length === 1 ? 'This file is' : 'These files are'} already shown in the description or a comment
              </TooltipContent>
            </Tooltip>
          </span>
        ) : null}
        {canUpload ? (
          <Button variant="ghost" size="xs" onClick={onAttach} className="ml-auto text-text-secondary">
            <Paperclip /> Attach files
          </Button>
        ) : null}
      </div>

      <StorageBanner storage={storage} className="mt-3" />
      <ByoFailingBanner
        storage={storage}
        bucket={overview.data?.connection?.bucket}
        canFix={canManage}
        className="mt-3"
      />

      {uploader ? (
        <UploadTray uploads={uploader.uploads} onCancel={uploader.cancel} onRetry={uploader.retry} className="mt-2" />
      ) : null}

      {loading ? (
        <div className="flex gap-2 py-3" role="status" aria-label="Loading attachments">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
      ) : shown.length === 0 && hidden.length > 0 ? (
        <p className="py-3 text-xs text-text-secondary">
          Every file here is already shown in the description or a comment.
        </p>
      ) : (
        <div className="flex flex-col gap-3 py-3">
          {images.length > 0 ? (
            <ul className="flex flex-wrap gap-3" aria-label="Images">
              {images.map(file => (
                <li key={file.id}>
                  <FileTile file={file} timeZone={timeZone} onDelete={setDeleting} byo={storage?.bring_your_own}>
                    {file.available ? (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={event => {
                          if (hasModifier(event)) return;
                          event.preventDefault();
                          setZoomed({ src: file.url, alt: file.filename, attachment: file });
                        }}
                        className="group/tile flex w-48 cursor-zoom-in flex-col overflow-hidden rounded-md border hover:border-border-strong"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind a redirect; next/image cannot fetch it */}
                        <img
                          src={file.url}
                          alt=""
                          loading="lazy"
                          width={file.width ?? undefined}
                          height={file.height ?? undefined}
                          className="h-28 w-full bg-inset object-cover"
                        />
                        <TileCaption file={file} />
                      </a>
                    ) : (
                      <span tabIndex={0} className="flex w-48 flex-col overflow-hidden rounded-md border border-dashed">
                        <UnavailableImage byo={storage?.bring_your_own} className="h-28 w-full" />
                        <TileCaption file={file} />
                      </span>
                    )}
                  </FileTile>
                </li>
              ))}
            </ul>
          ) : null}
          {others.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Files">
              {others.map(file => (
                <li key={file.id}>
                  <FileTile file={file} timeZone={timeZone} onDelete={setDeleting} byo={storage?.bring_your_own}>
                    {file.available ? (
                      <a
                        href={file.url}
                        // A PDF opens in the browser; everything else downloads without leaving the page.
                        {...(file.mime_type === 'application/pdf'
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : { download: file.filename })}
                        className="flex h-10 max-w-72 items-center gap-2 rounded-md border pr-3 pl-2 text-xs hover:border-border-strong hover:bg-hover"
                      >
                        <FileBadge filename={file.filename} mime={file.mime_type} className="h-6 flex-none" />
                        <span className="truncate text-text">{file.filename}</span>
                        <span className="flex-none tabular text-text-muted">{formatBytes(file.size_bytes)}</span>
                      </a>
                    ) : (
                      <span
                        tabIndex={0}
                        className="flex h-10 max-w-72 items-center gap-2 rounded-md border border-dashed pr-3 pl-2 text-xs"
                      >
                        <CloudOff className="size-icon-sm flex-none text-text-muted" aria-hidden />
                        <span className="truncate text-text-secondary">{file.filename}</span>
                        <span className="flex-none tabular text-text-muted">{formatBytes(file.size_bytes)}</span>
                      </span>
                    )}
                  </FileTile>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <Lightbox gallery={imageGallery(all)} start={zoomed} onClose={() => setZoomed(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => (open ? undefined : setDeleting(null))}
        title={`Delete ${deleting?.filename ?? 'this file'}?`}
        confirmLabel="Delete file"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: error => {
              setDeleting(null);
              toast.error(error.message);
            },
          });
        }}
      >
        <p>
          The file leaves {issueKey} for everyone and cannot be restored.
          {deleting?.inline
            ? ' It is shown in the description or a comment, where it will stop loading.'
            : ' Any link to it stops working.'}{' '}
          The history keeps a line saying it was removed.
        </p>
      </ConfirmDialog>
    </section>
  );
}

function TileCaption({ file }: { file: Attachment }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2 px-2 py-1.5 text-xs">
      <span className="truncate text-text">{file.filename}</span>
      <span className="ml-auto flex-none tabular text-text-muted">{formatBytes(file.size_bytes)}</span>
    </span>
  );
}

interface FileTileProps {
  file: Attachment;
  byo: ByoStatus | null | undefined;
  timeZone?: string | undefined;
  onDelete: (file: Attachment) => void;
  children: React.ReactNode;
}

function FileTile({ file, byo, timeZone, onDelete, children }: FileTileProps) {
  const where = file.comment_id !== null ? ' on a comment' : file.work_item_id !== null ? ' on spent time' : '';
  return (
    <div className="group/file relative">
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="bottom">
          {file.available ? null : <span className="block max-w-64 pb-1">{unavailableReason(byo)}</span>}
          <PersonName person={file.created_by} /> attached this{where} · {formatDateTime(file.created_at, timeZone)}
        </TooltipContent>
      </Tooltip>
      {file.me.can_delete ? (
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={`Delete ${file.filename}`}
          onClick={() => onDelete(file)}
          className="absolute -top-2 -right-2 rounded-full bg-raised text-text-secondary opacity-0 shadow-sm group-hover/file:opacity-100 focus-visible:opacity-100 hover:text-danger-fg"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
