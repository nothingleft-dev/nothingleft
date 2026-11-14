import type { Metadata } from 'next';
import { IssueList } from '@components/issues/list/issue-list';

export const metadata: Metadata = { title: 'Starred' };

export default function Page() {
  return (
    <IssueList
      title="Starred"
      base="#Star"
      views={false}
      empty={{
        title: 'You have not starred any issues.',
        description: 'Star an issue from its page to keep it one click away here.',
      }}
    />
  );
}
