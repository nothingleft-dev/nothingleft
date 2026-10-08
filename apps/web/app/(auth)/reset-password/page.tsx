import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { ResetPassword } from '@components/auth/reset-password';
import { authPageMetadata } from '@lib/auth-metadata';

export const metadata: Metadata = authPageMetadata('reset-password');

export default function Page() {
  return (
    <AuthSplit>
      <ResetPassword />
    </AuthSplit>
  );
}
