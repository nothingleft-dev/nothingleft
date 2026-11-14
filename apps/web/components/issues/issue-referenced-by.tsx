'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { DraftMark } from '@components/articles/draft-mark';
import { articlePath } from '@components/articles/article-row';
import { RelativeTime } from '@components/relative-time';
import { useReferencingArticles } from '@hooks/use-articles';

/**
 * The knowledge base articles whose text names this issue; hidden while there are none. Most issues
 * have none, so nothing holds its place while loading: a skeleton that then vanished would move Activity.
 */
export function IssueReferencedBy({ issueKey, timeZone }: { issueKey: string; timeZone?: string | undefined }) {
  const articles = useReferencingArticles(issueKey);
  if (!articles.isSuccess || articles.data.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="referenced-by">
      <div className="flex min-h-control items-center gap-2 border-b">
        <h2 id="referenced-by" className="text-sm font-semibold">
          Referenced by
        </h2>
        <span className="tabular text-xs text-text-muted">{articles.data.length}</span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {articles.data.map(a => (
          <li
            key={`${a.project.key}/${a.slug}`}
            className="relative flex h-row items-center gap-2.5 px-1 hover:bg-hover"
          >
            <FileText className="size-icon-sm flex-none text-text-muted" />
            <Link
              href={articlePath(a)}
              className="min-w-0 truncate text-sm after:absolute after:inset-0 hover:underline"
            >
              {a.title}
            </Link>
            {a.status === 'draft' ? <DraftMark /> : null}
            {a.parent ? (
              <span className="truncate text-xs text-text-muted max-sm:hidden">in {a.parent.title}</span>
            ) : null}
            <span className="ml-auto flex flex-none items-center gap-2 text-xs text-text-muted">
              <span className="font-mono text-2xs">{a.project.key}</span>
              <RelativeTime value={a.updated_at} timeZone={timeZone} className="relative" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
