import { ArticleRowsSkeleton } from '@components/articles/article-row';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <ArticleRowsSkeleton />
    </div>
  );
}
