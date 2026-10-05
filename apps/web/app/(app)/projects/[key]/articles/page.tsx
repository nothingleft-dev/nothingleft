import type { Metadata } from 'next';
import { parseProjectKey } from '@nothingleft/format';
import { KnowledgeBaseHome } from '@components/articles/kb-home';

type Params = { key: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  return { title: `${parseProjectKey(key) ?? key} knowledge base` };
}

export default function Page() {
  return <KnowledgeBaseHome />;
}
