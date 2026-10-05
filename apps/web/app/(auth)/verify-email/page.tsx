import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { VerifyEmail } from '@components/auth/verify-email';

export const metadata: Metadata = { title: 'Verify your email' };

export default function Page() {
  return (
    <AuthSplit>
      <VerifyEmail />
    </AuthSplit>
  );
}
