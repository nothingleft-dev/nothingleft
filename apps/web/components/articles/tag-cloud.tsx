'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { Tag } from '@nothingleft/types';
import { Skeleton } from '@components/ui/skeleton';
import { cn } from '@lib/utils';

/** A tag as the article query language spells it: braces when the name has a space. */
export const tagQuery = (tag: Pick<Tag, 'name'>) => `tag: ${/\s/.test(tag.name) ? `{${tag.name}}` : tag.name}`;

interface TagCloudProps {
  project: string;
  tags: readonly Tag[] | undefined;
  loading: boolean;
  /** The filter on screen, so the tag it names reads as on and clears on a second click. */
  activeQuery: string;
}

export function TagCloud({ project, tags, loading, activeQuery }: TagCloudProps) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-1.5 px-2" aria-hidden>
        {[56, 72, 48, 64].map(w => (
          <Skeleton key={w} className="h-5 rounded-sm" style={{ width: w }} />
        ))}
      </div>
    );
  }
  if (!tags || tags.length === 0) {
    return <p className="px-2 text-xs text-text-muted">Tags on articles show here, to filter by one click.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5 px-2" aria-label="Filter by tag">
      {tags.map(tag => {
        const q = tagQuery(tag);
        const on = activeQuery.trim() === q;
        const href = on ? `/projects/${project}/articles` : `/projects/${project}/articles?q=${encodeURIComponent(q)}`;
        return (
          <li key={tag.slug}>
            <Link
              href={href as Route}
              aria-pressed={on}
              className={cn(
                'inline-flex h-6 items-center gap-1.5 rounded-sm border px-1.5 text-xs text-text-secondary hover:border-border-strong hover:bg-hover hover:text-text',
                on && 'border-text-secondary bg-active text-text',
              )}
            >
              {tag.name}
              <span className="tabular text-text-muted">{tag.article_count}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
