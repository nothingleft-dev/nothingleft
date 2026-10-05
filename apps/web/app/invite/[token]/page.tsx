import type { Metadata } from 'next';
import { InviteFlow } from '@components/invite/invite-flow';

export const metadata: Metadata = { title: 'You’re invited' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteFlow token={token} />;
}
