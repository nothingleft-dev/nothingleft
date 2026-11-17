import type { Metadata } from 'next';
import { IssueList } from '@components/issues/list/issue-list';

export const metadata: Metadata = { title: 'My issues' };

export default function Page() {
  return (
    <IssueList
      title="My issues"
      base="assignee: me #Unresolved"
      views={false}
      empty={{
        title: 'Nothing open is assigned to you.',
        description: 'Issues assigned to you appear here until they are resolved.',
      }}
    />
  );
}
