import type { Metadata } from 'next';
import { GitHubCallback } from '@components/organization/integrations/github-callback';

export const metadata: Metadata = { title: 'Connecting GitHub', robots: { index: false } };

export default function Page() {
  return <GitHubCallback />;
}
