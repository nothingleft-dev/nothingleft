'use client';

import { RotateCw, X } from 'lucide-react';
import { formatBytes } from '@nothingleft/format';
import { Button } from '@components/ui/button';
import { FileBadge } from '@components/attachments/file-badge';
import { isUploadActive, type Upload } from '@hooks/use-attachments';
import { cn } from '@lib/utils';

const statusText = (upload: Upload) => {
  if (upload.status === 'preparing') return 'Preparing…';
  if (upload.status === 'completing') return 'Finishing…';
  const percent = Math.min(99, Math.floor((upload.loaded / upload.file.size) * 100));
  return `${formatBytes(upload.loaded)} of ${formatBytes(upload.file.size)} · ${percent}%`;
};

interface UploadTrayProps {
  uploads: readonly Upload[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  className?: string;
}

/** Files on their way, and the ones that did not make it; a finished file leaves the tray for the text or the list. */
export function UploadTray({ uploads, onCancel, onRetry, className }: UploadTrayProps) {
  const shown = uploads.filter(u => u.status !== 'done');
  if (shown.length === 0) return null;

  return (
    <ul aria-label="Uploads" className={cn('flex flex-col gap-1', className)}>
      {shown.map(upload => {
        const active = isUploadActive(upload);
        const ratio =
          upload.status === 'uploading' ? upload.loaded / upload.file.size : upload.status === 'completing' ? 1 : 0;
        return (
          <li key={upload.id} className="flex min-w-0 items-center gap-2 rounded-sm px-1 py-1 text-xs">
            <FileBadge filename={upload.file.name} mime={upload.mime} className="h-6 flex-none" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-text">{upload.file.name}</span>
                {active ? <span className="flex-none tabular text-text-secondary">{statusText(upload)}</span> : null}
              </div>
              {active ? (
                <div
                  role="progressbar"
                  aria-label={`Uploading ${upload.file.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(ratio * 100)}
                  className="h-1 w-full overflow-hidden rounded-full bg-inset"
                >
                  <i
                    className="block h-full rounded-full bg-text-secondary transition-[width] duration-200"
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              ) : (
                <p role="alert" className="text-danger-fg [overflow-wrap:anywhere]">
                  {upload.error}
                </p>
              )}
            </div>
            {upload.status === 'failed' && upload.retryable ? (
              <Button type="button" variant="ghost" size="xs" onClick={() => onRetry(upload.id)}>
                <RotateCw /> Retry
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-text-secondary"
              aria-label={active ? `Cancel uploading ${upload.file.name}` : `Dismiss ${upload.file.name}`}
              onClick={() => onCancel(upload.id)}
            >
              <X />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
