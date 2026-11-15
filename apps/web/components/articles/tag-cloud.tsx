'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { Tag } from '@nothingleft/types';
import { Skeleton } from '@components/ui/skeleton';
import { cn } from '@lib/utils';

const TAG_CAP = 12;

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
  const [showAll, setShowAll] = useState(false);
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
  const shown = showAll || tags.length <= TAG_CAP ? tags : withActive(tags, activeQuery);
  return (
    <ul className="flex flex-wrap items-center gap-1.5 px-2" aria-label="Filter by tag">
      {shown.map(tag => {
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
              <span className={cn('tabular', on ? 'text-text-secondary' : 'text-text-muted')}>{tag.article_count}</span>
            </Link>
          </li>
        );
      })}
      {tags.length > TAG_CAP ? (
        <li>
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="inline-flex h-6 items-center rounded-sm px-1.5 text-xs font-medium text-text-secondary hover:bg-hover hover:text-text"
          >
            {showAll ? 'Show fewer' : `Show all ${tags.length}`}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** The most-used tags, plus the one filtering the page when it is further down. */
function withActive(tags: readonly Tag[], activeQuery: string): readonly Tag[] {
  const top = tags.slice(0, TAG_CAP);
  const active = tags.slice(TAG_CAP).find(t => activeQuery.trim() === tagQuery(t));
  return active ? [...top, active] : top;
}
