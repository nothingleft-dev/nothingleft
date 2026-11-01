'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@components/page-header';
import { EmptyState } from '@components/empty-state';
import { Button } from '@components/ui/button';
import { ArticleResults } from '@components/articles/article-results';

/** Every article the reader can open, across projects, one section per project. */
export function AllArticles() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';

  const commit = (next: string) => {
    const query = next ? `?q=${encodeURIComponent(next)}` : '';
    router.replace(`${pathname}${query}` as Route, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Knowledge base" meta="Every project" />
      <ArticleResults
        q={q}
        onCommit={commit}
        grouped
        autoFocus={params.get('focus') === '1'}
        whenEmpty={
          <EmptyState
            title="No articles yet."
            description="Articles belong to a project. Open a project's Knowledge base to write the first one."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/projects">Choose a project</Link>
              </Button>
            }
          />
        }
      />
    </div>
  );
}
