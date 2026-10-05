import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { OAuthCallback } from '@components/auth/oauth-callback';

export const metadata: Metadata = { title: 'Signing you in' };

export default async function Page({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return (
    <AuthSplit>
      <OAuthCallback provider={provider} />
    </AuthSplit>
  );
}
