import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { SignInForm } from '@components/auth/sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function Page() {
  return (
    <AuthSplit>
      <SignInForm />
    </AuthSplit>
  );
}
