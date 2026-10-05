import type { Metadata } from 'next';
import { InboxPage } from '@components/notifications/inbox-page';

export const metadata: Metadata = { title: 'Inbox' };

export default function Page() {
  return <InboxPage />;
}
