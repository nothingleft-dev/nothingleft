import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseProjectKey } from '@nothingleft/format';
import { ArticlePage } from '@components/articles/article-page';

type Params = { key: string; slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key, slug } = await params;
  return { title: `${decodeURIComponent(slug)} · ${parseProjectKey(key) ?? key}` };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { key, slug } = await params;
  const parsed = parseProjectKey(key);
  if (!parsed) notFound();

  return <ArticlePage key={slug} project={parsed} slug={decodeURIComponent(slug)} />;
}
