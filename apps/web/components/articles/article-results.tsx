'use client';

import { Fragment, useMemo } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { ArticleSummary } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { LoadError, errorDetail } from '@components/query-state';
import { EmptyState } from '@components/empty-state';
import { QueryBar, type QueryProblem } from '@components/issues/list/query-bar';
import { ArticleRow, ArticleRowsSkeleton } from '@components/articles/article-row';
import { useArticleSearch } from '@hooks/use-articles';
import { useSession } from '@hooks/use-session';
import { isApiError } from '@lib/api/errors';
import { ProjectMarkByKey } from '@components/projects/project-mark';
import { LoadMore } from '@components/text-button';

export const ARTICLE_QUERY_PLACEHOLDER = 'Search articles, or try tag: rca';
const RECENT_SORT = 'updated desc';

interface ArticleResultsProps {
  project?: string;
  q: string;
  onCommit: (q: string) => void;
  /** Across projects: one section per project, in the order they first appear. */
  grouped?: boolean;
  autoFocus?: boolean;
  /** Shown instead of the empty list when nothing is searched for and nothing exists. */
  whenEmpty?: React.ReactNode;
}

export function ArticleResults({ project, q, onCommit, grouped = false, autoFocus, whenEmpty }: ArticleResultsProps) {
  const session = useSession();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;
  const search = useArticleSearch({ q, project, sort: q ? undefined : RECENT_SORT });
  const rows = useMemo(() => search.data?.pages.flatMap(p => p.data) ?? [], [search.data]);
  const total = search.data?.pages[0]?.meta.pagination?.total ?? rows.length;

  const problem = useMemo<QueryProblem | null>(() => {
    const error = search.error;
    if (!error || !isApiError(error) || error.status !== 400) return null;
    return {
      message: error.message,
      span: error.field === 'q' && error.span ? error.span : null,
      validValues: error.validValues ?? [],
    };
  }, [search.error]);

  const groups = useMemo(() => {
    if (!grouped) return [{ key: '', name: '', rows }];
    const byProject = new Map<string, { key: string; name: string; rows: ArticleSummary[] }>();
    for (const row of rows) {
      const group = byProject.get(row.project.key) ?? { key: row.project.key, name: row.project.name, rows: [] };
      group.rows.push(row);
      byProject.set(row.project.key, group);
    }
    return [...byProject.values()];
  }, [grouped, rows]);

  return (
    <div className="flex flex-col gap-4">
      <QueryBar
        value={q}
        onCommit={onCommit}
        problem={problem}
        kind="articles"
        label="Search articles"
        placeholder={ARTICLE_QUERY_PLACEHOLDER}
        autoFocus={autoFocus}
      />

      {search.isPending && !search.data ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading">
          <p className="text-xs text-text-secondary">{q ? 'Searching…' : 'Recently updated'}</p>
          {grouped ? (
            [3, 2].map(rows => (
              <Fragment key={rows}>
                <div className="mt-2 flex h-5 items-center gap-2" aria-hidden>
                  <Skeleton className="size-5 rounded-xs" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
                <ArticleRowsSkeleton rows={rows} />
              </Fragment>
            ))
          ) : (
            <ArticleRowsSkeleton />
          )}
        </div>
      ) : search.isError && !problem ? (
        <div className="flex flex-col gap-2">
          {q ? null : <p className="text-xs text-text-secondary">Recently updated</p>}
          <LoadError onRetry={() => void search.refetch()} detail={errorDetail(search.error)}>
            {q ? 'The search could not be run.' : 'The recent articles could not be loaded.'}
          </LoadError>
        </div>
      ) : problem && !search.data ? (
        <p className="text-xs text-text-secondary">Fix the query to see results.</p>
      ) : rows.length === 0 ? (
        !q && whenEmpty ? (
          whenEmpty
        ) : (
          <EmptyState
            title={q ? 'No article matches this search.' : 'No articles yet.'}
            description={
              q
                ? `Nothing matches ${q}. Widen the search or clear it.`
                : 'Articles appear here once someone in the project writes one.'
            }
            action={
              q ? (
                <Button variant="outline" size="sm" onClick={() => onCommit('')}>
                  Clear the search
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-secondary">
            {q ? (
              <>
                <span className="tabular font-medium text-text">{total}</span>{' '}
                {total === 1 ? 'article matches' : 'articles match'}
              </>
            ) : (
              'Recently updated'
            )}
          </p>
          {groups.map(group => (
            <Fragment key={group.key}>
              {grouped ? (
                <div className="mt-2 flex items-center gap-2">
                  <ProjectMarkByKey projectKey={group.key} />
                  <Link
                    href={`/projects/${group.key}/articles` as Route}
                    className="font-semibold text-text hover:underline"
                  >
                    {group.name}
                  </Link>
                  <span className="font-mono text-2xs text-text-muted">{group.key}</span>
                  <span className="text-xs text-text-muted">
                    · <span className="tabular">{group.rows.length}</span>{' '}
                    {group.rows.length === 1 ? 'article' : 'articles'}
                  </span>
                </div>
              ) : null}
              <ul className="divide-y divide-border-subtle rounded-md border">
                {group.rows.map(article => (
                  <ArticleRow key={`${article.project.key}/${article.slug}`} article={article} timeZone={timeZone} />
                ))}
              </ul>
            </Fragment>
          ))}
          {search.hasNextPage ? (
            <LoadMore
              pending={search.isFetchingNextPage}
              pendingLabel="Loading more…"
              onClick={() => void search.fetchNextPage()}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
