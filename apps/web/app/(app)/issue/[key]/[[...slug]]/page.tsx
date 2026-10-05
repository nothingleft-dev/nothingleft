import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatIssueKey, parseIssueKey } from '@nothingleft/format';
import { IssuePage } from '@components/issues/issue-page';

type Params = { key: string; slug?: string[] };

// A pasted key arrives in whatever case it was typed; the page renders the canonical form.
const canonical = (typed: string) => {
  const parsed = parseIssueKey(typed);
  return parsed && formatIssueKey(parsed.projectKey, parsed.number);
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  return { title: canonical(key) ?? key };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const key = canonical((await params).key);
  if (!key) notFound();
  return <IssuePage issueKey={key} />;
}
