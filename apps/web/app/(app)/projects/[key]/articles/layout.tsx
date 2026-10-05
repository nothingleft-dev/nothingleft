import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { parseProjectKey } from '@nothingleft/format';
import { KnowledgeBase } from '@components/articles/knowledge-base';

type Params = { key: string };

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<Params> }) {
  const { key } = await params;
  const parsed = parseProjectKey(key);
  if (!parsed) notFound();

  return <KnowledgeBase project={parsed}>{children}</KnowledgeBase>;
}
