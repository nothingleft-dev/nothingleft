import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseProjectKey } from '@nothingleft/format';
import { IssueList } from '@components/issues/list/issue-list';

type Params = { key: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  return { title: `${parseProjectKey(key) ?? key} issues` };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { key } = await params;
  const parsed = parseProjectKey(key);
  if (!parsed) notFound();

  return <IssueList project={parsed} />;
}
