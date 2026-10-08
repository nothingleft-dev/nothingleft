import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { SignUpForm } from '@components/auth/sign-up-form';
import { authPageMetadata } from '@lib/auth-metadata';

export const metadata: Metadata = authPageMetadata('sign-up');

export default function Page() {
  return (
    <AuthSplit panel="signup">
      <SignUpForm />
    </AuthSplit>
  );
}
