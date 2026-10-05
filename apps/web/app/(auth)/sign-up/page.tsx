import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { SignUpForm } from '@components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Create your account' };

export default function Page() {
  return (
    <AuthSplit panel="signup">
      <SignUpForm />
    </AuthSplit>
  );
}
