'use client';

import { Fragment, useMemo } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { ArticleSummary } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { EmptyState } from '@components/empty-state';
import { QueryBar, type QueryProblem } from '@components/issues/list/query-bar';
import { ArticleRow, ArticleRowsSkeleton } from '@components/articles/article-row';
import { useArticleSearch } from '@hooks/use-articles';
import { useSession } from '@hooks/use-session';
import { isApiError } from '@lib/api/errors';

export const ARTICLE_QUERY_PLACEHOLDER = 'Search articles · tag: rca status: draft updated: {minus 30d} .. Today';
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
        <ArticleRowsSkeleton />
      ) : search.isError && !problem ? (
        <FormAlert title="The articles could not be loaded.">
          {search.error instanceof Error ? search.error.message : null}
        </FormAlert>
      ) : problem && !search.data ? (
        <EmptyState
          title="Fix the query to see results."
          description="The message above names the part at fault. Valid values, where there are any, are one click away."
        />
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
                <div className="mt-2 flex items-baseline gap-2">
                  <Link
                    href={`/projects/${group.key}/articles` as Route}
                    className="font-semibold text-text hover:underline"
                  >
                    {group.name}
                  </Link>
                  <span className="font-mono text-2xs text-text-muted">{group.key}</span>
                  <span className="tabular text-xs text-text-muted">{group.rows.length}</span>
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
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={search.isFetchingNextPage}
              onClick={() => void search.fetchNextPage()}
            >
              {search.isFetchingNextPage ? 'Loading more…' : 'Load more'}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
