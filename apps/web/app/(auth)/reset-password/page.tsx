import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { ResetPassword } from '@components/auth/reset-password';

export const metadata: Metadata = { title: 'Reset your password' };

export default function Page() {
  return (
    <AuthSplit>
      <ResetPassword />
    </AuthSplit>
  );
}
