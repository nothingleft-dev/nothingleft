'use client';

import Link from 'next/link';
import { parseIssueKey } from '@nothingleft/format';
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
  const projectKey = parseIssueKey(issueKey)?.projectKey;
  if (!articles.isSuccess || articles.data.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="referenced-by">
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
            {a.parent || a.project.key !== projectKey ? (
              <span className="max-w-[45%] flex-none truncate text-xs text-text-muted max-sm:hidden">
                in {a.parent ? a.parent.title : a.project.name}
              </span>
            ) : null}
            <span className="ml-auto flex flex-none items-center gap-2 pl-2 text-xs text-text-muted">
              <RelativeTime value={a.updated_at} timeZone={timeZone} className="relative" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
