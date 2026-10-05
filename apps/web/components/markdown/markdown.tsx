'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { slugify } from '@nothingleft/format';
import { extractIssueKeys, renderMarkdown } from '@nothingleft/markdown';
import { Lightbox, imageGallery, type LightboxImage } from '@components/attachments/lightbox';
import { IssueRefCard, useIssueRefCard } from '@components/markdown/issue-ref-card';
import { useMarkdownAttachments } from '@components/markdown/markdown-attachments';
import { unavailableLabel, unavailableReason } from '@components/attachments/unavailable-file';
import { useStorage } from '@hooks/use-attachments';
import { useIssueRefs } from '@hooks/use-issues';
import { cn } from '@lib/utils';

export type MarkdownVariant = 'description' | 'comment';

interface MarkdownProps {
  source: string;
  /** `description` is the 15px prose column; `comment` is the denser 14px activity body. */
  variant?: MarkdownVariant;
  className?: string;
  /** Given only where the viewer may edit the text: a tick is an edit of it. */
  onToggleTask?: (index: number, checked: boolean) => void;
  /** Receives the rendered headings, each given an id to link to: the article's table of contents. */
  onHeadings?: (headings: MarkdownHeading[]) => void;
}

export interface MarkdownHeading {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

const issueHref = (key: string) => `/issue/${key}`;

/** The only component allowed to write HTML: the source is sanitised by @nothingleft/markdown at render. */
export function Markdown({ source, variant = 'description', className, onToggleTask, onHeadings }: MarkdownProps) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const keys = useMemo(() => extractIssueKeys(source), [source]);
  const refs = useIssueRefs(keys);
  const byKey = useMemo(() => new Map((refs.data ?? []).map(r => [r.key, r])), [refs.data]);

  const resolved = useMemo(
    () =>
      [...byKey.values()]
        .filter(r => r.resolved)
        .map(r => r.key)
        .join(' '),
    [byKey],
  );
  const isResolvedIssue = useCallback((key: string) => resolved.split(' ').includes(key), [resolved]);
  const files = useMarkdownAttachments();
  const byo = useStorage().storage?.bring_your_own;
  const imageSize = useCallback(
    (src: string) => {
      const file = files.get(src);
      return file?.width && file.height ? { width: file.width, height: file.height } : null;
    },
    [files],
  );
  const html = useMemo(
    () => renderMarkdown(source, { issueHref, isResolvedIssue, imageSize }),
    [source, isResolvedIssue, imageSize],
  );
  const [zoomed, setZoomed] = useState<LightboxImage | null>(null);
  const gallery = useMemo(() => imageGallery([...files.values()]), [files]);
  const card = useIssueRefCard(byKey);
  const headingsRef = useRef(onHeadings);
  useLayoutEffect(() => {
    headingsRef.current = onHeadings;
  });

  useLayoutEffect(() => {
    const el = root.current;
    const report = headingsRef.current;
    if (!el || !report) return;
    const seen = new Map<string, number>();
    const headings: MarkdownHeading[] = [];
    for (const h of el.querySelectorAll<HTMLHeadingElement>('h1, h2, h3')) {
      const text = h.textContent?.trim() ?? '';
      const base = slugify(text) || 'section';
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      h.id = n === 0 ? base : `${base}-${n + 1}`;
      headings.push({ id: h.id, text, level: Number(h.tagName[1]) as MarkdownHeading['level'] });
    }
    report(headings);
  }, [html]);

  // A file whose bucket cannot serve it would be a broken image; draw what happened instead.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    for (const image of el.querySelectorAll<HTMLImageElement>('img')) {
      const file = files.get(image.getAttribute('src') ?? '');
      if (file && !file.available) {
        image.replaceWith(unavailablePlaceholder(file.filename, unavailableLabel(byo), unavailableReason(byo)));
      }
    }
    const onError = (event: Event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !el.contains(image)) return;
      image.replaceWith(unavailablePlaceholder(image.alt, 'Image not available', 'This image could not be loaded.'));
    };
    el.addEventListener('error', onError, true);
    return () => el.removeEventListener('error', onError, true);
  }, [html, files, byo]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    for (const box of el.querySelectorAll<HTMLInputElement>('input[data-task]')) {
      box.disabled = !onToggleTask;
      box.setAttribute('aria-label', onToggleTask ? 'Toggle task' : 'Task');
    }
    // A key nobody can open reads as plain text once the lookup has answered.
    if (!refs.isSuccess) return;
    for (const link of el.querySelectorAll<HTMLAnchorElement>('a[data-issue-key]')) {
      link.classList.toggle('missing', !byKey.has(link.dataset.issueKey ?? ''));
    }
  }, [html, onToggleTask, byKey, refs.isSuccess]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.dataset.task !== undefined) {
      if (onToggleTask) onToggleTask(Number(target.dataset.task), target.checked);
      return;
    }
    const link = target.closest('a');
    if (!link && target instanceof HTMLImageElement) {
      const src = target.getAttribute('src') ?? '';
      setZoomed({ src, alt: target.alt, attachment: files.get(src) });
      return;
    }
    if (!link) return;
    if (link.classList.contains('missing')) return event.preventDefault();
    const href = link.getAttribute('href');
    if (!href?.startsWith('/') || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    router.push(href as Route);
  };

  return (
    <>
      <div
        ref={root}
        className={cn('md', variant === 'comment' && 'md-comment', className)}
        onClick={onClick}
        onMouseOver={card.onPointerOver}
        onMouseOut={card.onPointerOut}
        onFocus={card.onPointerOver}
        onBlur={card.onPointerOut}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <IssueRefCard state={card} />
      <Lightbox gallery={gallery} start={zoomed} onClose={() => setZoomed(null)} />
    </>
  );
}

function unavailablePlaceholder(name: string, label: string, reason: string) {
  const box = document.createElement('span');
  box.className = 'md-unavailable';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `${name || 'Image'}: ${reason}`);
  box.title = reason;
  const title = document.createElement('span');
  title.className = 'md-unavailable-label';
  title.textContent = label;
  box.append(title);
  if (name) {
    const file = document.createElement('span');
    file.className = 'md-unavailable-name';
    file.textContent = name;
    box.append(file);
  }
  return box;
}
