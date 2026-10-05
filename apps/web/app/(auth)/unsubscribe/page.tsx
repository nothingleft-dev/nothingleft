import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { Unsubscribe } from '@components/notifications/unsubscribe';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } };

export default function Page() {
  return (
    <AuthSplit>
      <Unsubscribe />
    </AuthSplit>
  );
}
