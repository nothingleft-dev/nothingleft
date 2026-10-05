import type { Metadata } from 'next';
import { parseProjectKey } from '@nothingleft/format';
import { CreateIssuePage } from '@components/issues/create-issue-page';

export const metadata: Metadata = { title: 'New issue' };

export default async function Page({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <CreateIssuePage projectKey={project ? parseProjectKey(project) : null} />;
}
