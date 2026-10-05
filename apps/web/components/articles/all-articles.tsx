'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@components/page-header';
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
      <ArticleResults q={q} onCommit={commit} grouped autoFocus={params.get('focus') === '1'} />
    </div>
  );
}
