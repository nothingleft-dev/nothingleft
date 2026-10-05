'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { FileText, Star } from 'lucide-react';
import type { ArticleSummary } from '@nothingleft/types';
import { Skeleton } from '@components/ui/skeleton';
import { DraftMark } from '@components/articles/draft-mark';
import { PersonName } from '@components/former-member-chip';
import { RelativeTime } from '@components/relative-time';

export const articlePath = (article: { project: { key: string }; slug: string }) =>
  `/projects/${article.project.key}/articles/${article.slug}` as Route;

interface ArticleRowProps {
  article: ArticleSummary;
  showProject?: boolean;
  showExcerpt?: boolean;
  timeZone?: string | undefined;
}

export function ArticleRow({ article, showProject = false, showExcerpt = true, timeZone }: ArticleRowProps) {
  return (
    <li className="group/article relative flex gap-3 px-3 py-2.5 hover:bg-hover">
      <FileText className="mt-0.5 size-icon-sm flex-none text-text-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={articlePath(article)}
            className="min-w-0 truncate font-medium text-text after:absolute after:inset-0 hover:underline"
          >
            {article.title}
          </Link>
          {article.status === 'draft' ? <DraftMark /> : null}
          {article.starred ? (
            <Star aria-label="Starred" className="size-3.5 flex-none fill-current text-brand-text" />
          ) : null}
          {showProject ? <span className="font-mono text-2xs text-text-muted">{article.project.key}</span> : null}
          {article.parent ? <span className="truncate text-xs text-text-muted">in {article.parent.title}</span> : null}
          <span className="ml-auto flex flex-none items-center gap-1 text-xs text-text-secondary">
            <PersonName person={article.updated_by} />
            <RelativeTime value={article.updated_at} timeZone={timeZone} className="relative" />
          </span>
        </div>
        {showExcerpt && article.excerpt ? (
          <p className="line-clamp-2 max-w-[90ch] text-xs leading-5 text-text-secondary">{article.excerpt}</p>
        ) : null}
        {article.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {article.tags.map(t => (
              <span
                key={t.slug}
                className="inline-flex h-5 items-center rounded-sm border px-1.5 text-2xs font-medium text-text-secondary"
              >
                {t.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function ArticleRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border-subtle rounded-md border" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex gap-3 px-3 py-3">
          <Skeleton className="size-4 rounded-xs" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5" style={{ width: `${30 + ((i * 13) % 30)}%` }} />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-3 w-20" />
        </li>
      ))}
    </ul>
  );
}
