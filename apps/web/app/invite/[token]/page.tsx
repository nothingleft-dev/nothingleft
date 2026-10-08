import type { Metadata } from 'next';
import { InviteFlow } from '@components/invite/invite-flow';
import { authPageMetadata } from '@lib/auth-metadata';

export const metadata: Metadata = authPageMetadata('invite');

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteFlow token={token} />;
}
