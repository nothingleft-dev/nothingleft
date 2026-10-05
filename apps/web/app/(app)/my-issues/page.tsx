import type { Metadata } from 'next';
import { IssueList } from '@components/issues/list/issue-list';

export const metadata: Metadata = { title: 'My issues' };

export default function Page() {
  return <IssueList title="My issues" base="assignee: me #Unresolved" views={false} />;
}
