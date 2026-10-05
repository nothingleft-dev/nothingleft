'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Link2, Minus, Plus, Trash2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { toast } from 'sonner';
import { formatBytes } from '@nothingleft/format';
import type { Attachment } from '@nothingleft/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { ConfirmDialog } from '@components/confirm-dialog';
import { useDeleteAttachment } from '@hooks/use-attachments';
import { isInlineImage } from '@lib/files';
import { cn } from '@lib/utils';

export interface LightboxImage {
  src: string;
  alt: string;
  /** Present when the image is one of the issue's files: name, size, stored dimensions, delete. */
  attachment?: Attachment | undefined;
}

/** The issue's images in list order, which is what ← and → walk through. */
export const imageGallery = (files: readonly Attachment[]): LightboxImage[] =>
  files
    .filter(f => f.available && isInlineImage(f.mime_type))
    .map(f => ({ src: f.url, alt: f.filename, attachment: f }));

interface LightboxProps {
  gallery: readonly LightboxImage[];
  /** The image to open on; null keeps the lightbox closed. */
  start: LightboxImage | null;
  onClose: () => void;
}

const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

/**
 * Full-screen on the dark panel surface in both themes (design § 8c), like a photo viewer. The image
 * is a plain <img>, so right-click → Open image in new tab still works.
 */
export function Lightbox({ gallery, start, onClose }: LightboxProps) {
  const images = start && !gallery.some(g => g.src === start.src) ? [start] : gallery;
  const [src, setSrc] = useState<string | null>(start?.src ?? null);
  const [opened, setOpened] = useState(start);
  if (start !== opened) {
    setOpened(start);
    setSrc(start?.src ?? null);
  }

  const index = Math.max(
    0,
    images.findIndex(i => i.src === src),
  );
  const current = start ? images[index] : undefined;
  const viewer = useRef<HTMLDivElement>(null);
  const go = (step: number) => {
    if (images.length < 2) return;
    setSrc(images[(index + step + images.length) % images.length]!.src);
  };

  return (
    <DialogPrimitive.Root open={Boolean(start && current)} onOpenChange={open => (open ? undefined : onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-panel/95 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col text-panel-ink outline-none"
          // Focus the viewer, not the first button: a focused button shows its tooltip, and Esc closes that first.
          onOpenAutoFocus={event => {
            event.preventDefault();
            viewer.current?.focus();
          }}
        >
          {current ? (
            <Viewer
              ref={viewer}
              image={current}
              position={images.length > 1 ? `${index + 1} of ${images.length}` : null}
              images={images}
              onPick={setSrc}
              onStep={go}
              onClose={onClose}
            />
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface ViewerProps {
  ref: Ref<HTMLDivElement>;
  image: LightboxImage;
  images: readonly LightboxImage[];
  position: string | null;
  onPick: (src: string) => void;
  onStep: (step: number) => void;
  onClose: () => void;
}

function Viewer({ ref, image, images, position, onPick, onStep, onClose }: ViewerProps) {
  const file = image.attachment;
  const stage = useRef<HTMLDivElement>(null);
  const storedSize = file?.width && file.height ? { width: file.width, height: file.height } : null;
  const [natural, setNatural] = useState(storedSize);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteAttachment(file?.issue ?? '');
  // Kept mounted across images so keyboard focus survives ← and →; each image starts at fit.
  const [shown, setShown] = useState(image.src);
  if (shown !== image.src) {
    setShown(image.src);
    setNatural(storedSize);
    setZoom(1);
  }

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit never enlarges: a small screenshot opens at its own size.
  const fit = natural && box ? Math.min(box.width / natural.width, box.height / natural.height, 1) : 1;
  const scale = fit * zoom;
  const zoomBy = (factor: number) => setZoom(z => Math.min(MAX_SCALE / fit, Math.max(MIN_SCALE / fit, z * factor)));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLButtonElement && event.key === 'Enter') return;
    if (event.key === 'ArrowRight') onStep(1);
    else if (event.key === 'ArrowLeft') onStep(-1);
    else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
    else if (event.key === '-') zoomBy(1 / ZOOM_STEP);
    else if (event.key === '0') setZoom(1);
    else return;
    event.preventDefault();
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(image.src);
    toast.success('Link copied.');
  };

  return (
    <div ref={ref} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none" onKeyDown={onKeyDown}>
      <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <DialogPrimitive.Title className="truncate text-sm font-medium">
            {file?.filename ?? (image.alt || 'Image')}
          </DialogPrimitive.Title>
          <span className="flex-none text-xs tabular text-panel-ink-muted">
            {[
              file ? formatBytes(file.size_bytes) : null,
              natural ? `${natural.width} × ${natural.height}` : null,
              position,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div role="group" aria-label="Zoom" className="flex items-center gap-0.5 rounded-full bg-panel-card p-1">
          <PanelButton label="Zoom out" keys="−" onClick={() => zoomBy(1 / ZOOM_STEP)}>
            <Minus />
          </PanelButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="h-7 min-w-14 rounded-full px-2 text-xs tabular text-panel-ink hover:bg-panel-line"
              >
                {Math.round(scale * 100)}%
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Fit to screen <span className="ml-2 text-text-muted">0</span>
            </TooltipContent>
          </Tooltip>
          <PanelButton label="Zoom in" keys="+" onClick={() => zoomBy(ZOOM_STEP)}>
            <Plus />
          </PanelButton>
        </div>
        <div className="flex justify-end">
          <PanelButton label="Close" keys="Esc" onClick={onClose}>
            <X />
          </PanelButton>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div ref={stage} className="flex min-h-0 flex-1 overflow-auto px-20 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind a redirect; next/image cannot fetch it */}
          <img
            key={image.src}
            src={image.src}
            alt={image.alt}
            draggable={false}
            onLoad={e =>
              natural
                ? undefined
                : setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
            }
            style={natural ? { width: natural.width * scale, height: natural.height * scale } : undefined}
            className={cn('m-auto max-w-none flex-none rounded-sm', !natural && 'max-h-full max-w-full')}
          />
        </div>
        {images.length > 1 ? (
          <>
            <StepButton side="left" label="Previous image" onClick={() => onStep(-1)}>
              <ChevronLeft />
            </StepButton>
            <StepButton side="right" label="Next image" onClick={() => onStep(1)}>
              <ChevronRight />
            </StepButton>
          </>
        ) : null}
      </div>

      <footer className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 py-3">
        <div className="flex gap-1">
          <PanelButton label="Copy link" onClick={copyLink}>
            <Link2 />
          </PanelButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={image.src}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in new tab"
                className="inline-grid size-8 place-items-center rounded-full text-panel-ink-muted hover:bg-panel-card hover:text-panel-ink [&_svg]:size-4"
              >
                <ExternalLink />
              </a>
            </TooltipTrigger>
            <TooltipContent>Open in new tab</TooltipContent>
          </Tooltip>
        </div>
        {images.length > 1 ? (
          <ul aria-label="Images" className="flex max-w-[70vw] gap-2 overflow-x-auto p-1">
            {images.map(item => (
              <li key={item.src} className="flex-none">
                <button
                  type="button"
                  aria-label={item.attachment?.filename ?? item.alt}
                  aria-current={item.src === image.src}
                  onClick={() => onPick(item.src)}
                  className={cn(
                    'block overflow-hidden rounded-sm border-2 border-transparent opacity-60 hover:opacity-100',
                    item.src === image.src && 'border-panel-accent opacity-100',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
                  <img src={item.src} alt="" loading="lazy" className="h-12 w-18 bg-panel-card object-cover" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <div className="flex justify-end">
          {file?.me.can_delete ? (
            <PanelButton label="Delete file" onClick={() => setDeleting(true)}>
              <Trash2 />
            </PanelButton>
          ) : null}
        </div>
      </footer>

      {file ? (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${file.filename}?`}
          confirmLabel="Delete file"
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(file.id, {
              onSuccess: () => {
                setDeleting(false);
                if (images.length > 1) onStep(1);
                else onClose();
              },
              onError: error => {
                setDeleting(false);
                toast.error(error.message);
              },
            })
          }
        >
          <p>
            The file leaves {file.issue} for everyone and cannot be restored.
            {file.inline
              ? ' It is shown in the description or a comment, where it will stop loading.'
              : ' Any link to it stops working.'}{' '}
            The history keeps a line saying it was removed.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

interface PanelButtonProps {
  label: string;
  keys?: string;
  onClick: () => void;
  children: ReactNode;
}

function PanelButton({ label, keys, onClick, children }: PanelButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="inline-grid size-8 place-items-center rounded-full text-panel-ink-muted hover:bg-panel-card hover:text-panel-ink [&_svg]:size-4"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {keys ? <span className="ml-2 text-text-muted">{keys}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function StepButton({
  side,
  label,
  onClick,
  children,
}: {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-panel-card text-panel-ink hover:bg-panel-line [&_svg]:size-5',
            side === 'left' ? 'left-4' : 'right-4',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label} <span className="ml-2 text-text-muted">{side === 'left' ? '←' : '→'}</span>
      </TooltipContent>
    </Tooltip>
  );
}
