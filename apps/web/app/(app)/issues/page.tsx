import type { Metadata } from 'next';
import { IssueList } from '@components/issues/list/issue-list';

export const metadata: Metadata = { title: 'Issues' };

export default function IssuesPage() {
  return <IssueList title="Issues" />;
}
